package com.abs.agentapp

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * 将用户通过 SAF 选择的目录同步到 App 沙盒。
 * 复制到：files/agent-app/projects/{projectId}/
 *
 * 安装：复制到 android/app/src/main/java/com/abs/agentapp/
 * 并在 MainActivity 注册 registerPlugin(ProjectStoragePlugin::class.java)
 */
@CapacitorPlugin(name = "AgentProjectStorage")
class ProjectStoragePlugin : Plugin() {

    private val textExt = setOf(
        ".php", ".js", ".ts", ".vue", ".css", ".html", ".json", ".md", ".txt",
        ".xml", ".yml", ".yaml", ".env", ".sql", ".sh", ".jsx", ".tsx", ".scss"
    )
    private val skipDirs = setOf(
        "node_modules", ".git", "vendor", "dist", "build", ".gradle", "android", "ios"
    )

    private fun sandboxRoot(projectId: String): File {
        return File(context.filesDir, "agent-app/projects/$projectId").apply { mkdirs() }
    }

    private fun getOrCreateDir(root: DocumentFile, parts: List<String>): DocumentFile? {
        var dir = root
        for (part in parts) {
            if (part.isEmpty()) continue
            val next = dir.findFile(part) ?: dir.createDirectory(part)
            if (next == null) return null
            dir = next
        }
        return dir
    }

    @PluginMethod
    fun syncTree(call: PluginCall) {
        val treeUri = call.getString("treeUri") ?: ""
        val projectId = call.getString("projectId") ?: ""
        val maxFiles = call.getInt("maxFiles") ?: 800
        val maxBytes = call.getLong("maxFileBytes") ?: (512L * 1024L)

        if (treeUri.isEmpty() || projectId.isEmpty()) {
            call.reject("treeUri and projectId required")
            return
        }

        Thread {
            try {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri))
                    ?: throw RuntimeException("无法打开目录 URI")
                val dest = sandboxRoot(projectId)
                var copied = 0
                var skipped = 0
                var bytes = 0L
                val errors = JSONArray()
                val queue = ArrayDeque<Pair<DocumentFile, String>>()
                queue.add(Pair(root, ""))

                while (queue.isNotEmpty() && copied < maxFiles) {
                    val (dir, rel) = queue.removeFirst()
                    for (child in dir.listFiles()) {
                        val name = child.name ?: continue
                        if (child.isDirectory) {
                            if (skipDirs.contains(name.lowercase())) {
                                skipped++
                                continue
                            }
                            val sub = if (rel.isEmpty()) name else "$rel/$name"
                            queue.add(Pair(child, sub))
                        } else if (child.isFile) {
                            val ext = name.substringAfterLast('.', "").lowercase()
                            val dotted = if (ext.isEmpty()) "" else ".$ext"
                            if (!textExt.contains(dotted) && name != ".htaccess") {
                                skipped++
                                continue
                            }
                            val relPath = if (rel.isEmpty()) name else "$rel/$name"
                            val size = child.length()
                            if (size > maxBytes) {
                                skipped++
                                errors.put("$relPath: too large")
                                continue
                            }
                            try {
                                val outFile = File(dest, relPath)
                                outFile.parentFile?.mkdirs()
                                context.contentResolver.openInputStream(child.uri)?.use { input ->
                                    FileOutputStream(outFile).use { output ->
                                        input.copyTo(output)
                                    }
                                }
                                copied++
                                bytes += size
                            } catch (e: Exception) {
                                errors.put("$relPath: ${e.message}")
                            }
                        }
                    }
                }

                val ret = JSObject()
                ret.put("copied", copied)
                ret.put("skipped", skipped)
                ret.put("bytes", bytes)
                ret.put("errors", errors)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "sync failed")
            }
        }.start()
    }

    @PluginMethod
    fun exportFiles(call: PluginCall) {
        val treeUri = call.getString("treeUri") ?: ""
        val projectId = call.getString("projectId") ?: ""
        val pathsArr = call.getArray("paths")

        if (treeUri.isEmpty() || projectId.isEmpty() || pathsArr == null) {
            call.reject("treeUri, projectId and paths required")
            return
        }

        Thread {
            try {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri))
                    ?: throw RuntimeException("无法打开目录 URI")
                val srcBase = sandboxRoot(projectId)
                var exported = 0
                val errors = JSONArray()

                for (i in 0 until pathsArr.length()) {
                    val rel = pathsArr.getString(i) ?: continue
                    if (rel.startsWith(".") || rel.contains("..")) {
                        errors.put("$rel: invalid path")
                        continue
                    }
                    val srcFile = File(srcBase, rel)
                    if (!srcFile.isFile) {
                        errors.put("$rel: not in sandbox")
                        continue
                    }
                    val parts = rel.split("/")
                    val fileName = parts.last()
                    val parentParts = parts.dropLast(1)
                    val parent = if (parentParts.isEmpty()) root else getOrCreateDir(root, parentParts)
                    if (parent == null) {
                        errors.put("$rel: cannot create parent dir")
                        continue
                    }
                    try {
                        parent.findFile(fileName)?.delete()
                        val mime = "text/plain"
                        val outDoc = parent.createFile(mime, fileName)
                            ?: throw RuntimeException("createFile failed")
                        FileInputStream(srcFile).use { input ->
                            context.contentResolver.openOutputStream(outDoc.uri)?.use { output ->
                                input.copyTo(output)
                            } ?: throw RuntimeException("openOutputStream failed")
                        }
                        exported++
                    } catch (e: Exception) {
                        errors.put("$rel: ${e.message}")
                    }
                }

                val ret = JSObject()
                ret.put("exported", exported)
                ret.put("errors", errors)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "export failed")
            }
        }.start()
    }

    @PluginMethod
    fun listSandbox(call: PluginCall) {
        val projectId = call.getString("projectId") ?: ""
        Thread {
            try {
                val base = sandboxRoot(projectId)
                val files = JSONArray()
                fun walk(dir: File, prefix: String) {
                    dir.listFiles()?.forEach { f ->
                        val rel = if (prefix.isEmpty()) f.name else "$prefix/${f.name}"
                        if (f.isDirectory) walk(f, rel) else files.put(rel)
                    }
                }
                walk(base, "")
                val ret = JSObject()
                ret.put("files", files)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "list failed")
            }
        }.start()
    }
}

package com.abs.agentapp

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.apache.commons.net.ftp.FTP
import org.apache.commons.net.ftp.FTPClient
import org.apache.commons.net.ftp.FTPReply
import java.io.File
import java.io.FileInputStream

/**
 * 将本文件复制到 android/app/src/main/java/com/abs/agentapp/FtpPlugin.kt
 * 并在 MainActivity 中注册：registerPlugin(FtpPlugin::class.java)
 *
 * build.gradle 添加：implementation 'commons-net:commons-net:3.11.1'
 */
@CapacitorPlugin(name = "AgentFtp")
class FtpPlugin : Plugin() {

    private fun client(call: PluginCall): FTPClient {
        val host = call.getString("host") ?: throw IllegalArgumentException("host required")
        val port = call.getInt("port") ?: 21
        val user = call.getString("username") ?: ""
        val pass = call.getString("password") ?: ""
        val passive = call.getBoolean("passive") ?: true
        val secure = call.getBoolean("secure") ?: false

        val ftp = FTPClient()
        ftp.connect(host, port)
        if (!FTPReply.isPositiveCompletion(ftp.replyCode)) {
            ftp.disconnect()
            throw RuntimeException("FTP connect failed")
        }
        if (!ftp.login(user, pass)) {
            throw RuntimeException("FTP login failed")
        }
        if (passive) ftp.enterLocalPassiveMode()
        ftp.setFileType(FTP.BINARY_FILE_TYPE)
        if (secure) {
            /* FTPS: 使用 FTPClient with SSL — 生产环境按主机要求配置 */
        }
        return ftp
    }

    @PluginMethod
    fun list(call: PluginCall) {
        val remotePath = call.getString("remotePath") ?: "/"
        Thread {
            try {
                val ftp = client(call)
                val files = ftp.listFiles(remotePath) ?: emptyArray()
                val arr = com.getcapacitor.PluginResult()
                val ret = JSObject()
                val entries = org.json.JSONArray()
                for (f in files) {
                    val o = JSObject()
                    o.put("name", f.name)
                    o.put("path", if (remotePath.endsWith("/")) remotePath + f.name else "$remotePath/${f.name}")
                    o.put("isDirectory", f.isDirectory)
                    o.put("size", f.size)
                    entries.put(o)
                }
                ret.put("entries", entries)
                ftp.logout()
                ftp.disconnect()
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "list failed")
            }
        }.start()
    }

    @PluginMethod
    fun upload(call: PluginCall) {
        val localPath = call.getString("localPath") ?: ""
        val remotePath = call.getString("remotePath") ?: ""
        Thread {
            try {
                val ftp = client(call)
                val file = File(context.filesDir, localPath)
                FileInputStream(file).use { input ->
                    if (!ftp.storeFile(remotePath, input)) {
                        throw RuntimeException("storeFile failed")
                    }
                }
                ftp.logout()
                ftp.disconnect()
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "upload failed")
            }
        }.start()
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val remotePath = call.getString("remotePath") ?: ""
        val localPath = call.getString("localPath") ?: ""
        Thread {
            try {
                val ftp = client(call)
                val file = File(context.filesDir, localPath)
                file.parentFile?.mkdirs()
                java.io.FileOutputStream(file).use { output ->
                    if (!ftp.retrieveFile(remotePath, output)) {
                        throw RuntimeException("retrieveFile failed")
                    }
                }
                ftp.logout()
                ftp.disconnect()
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "download failed")
            }
        }.start()
    }

    @PluginMethod
    fun delete(call: PluginCall) {
        val remotePath = call.getString("remotePath") ?: ""
        Thread {
            try {
                val ftp = client(call)
                if (!ftp.deleteFile(remotePath)) {
                    throw RuntimeException("deleteFile failed")
                }
                ftp.logout()
                ftp.disconnect()
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "delete failed")
            }
        }.start()
    }

    @PluginMethod
    fun mkdir(call: PluginCall) {
        val remotePath = call.getString("remotePath") ?: ""
        Thread {
            try {
                val ftp = client(call)
                if (!ftp.makeDirectory(remotePath)) {
                    throw RuntimeException("makeDirectory failed")
                }
                ftp.logout()
                ftp.disconnect()
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "mkdir failed")
            }
        }.start()
    }
}

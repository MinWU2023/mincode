import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/chat', name: 'chat', component: () => import('@/views/ChatView.vue') },
    { path: '/projects', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
    { path: '/projects/:id', name: 'project-edit', component: () => import('@/views/ProjectEditView.vue') },
    { path: '/ftp', name: 'ftp', component: () => import('@/views/FtpBrowserView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  ],
});

export default router;

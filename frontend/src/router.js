import { createRouter, createWebHistory } from "vue-router";
import MobileApp from "./MobileApp.vue";
import BackofficeApp from "./views/BackofficeApp.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: MobileApp },
    { path: "/backoffice", component: BackofficeApp },
  ],
});

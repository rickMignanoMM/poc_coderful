import { createApp } from "vue";
import { addCollection } from "@iconify/vue";
import { icons as lucide } from "@iconify-json/lucide";
import App from "./App.vue";
import router from "./router.js";

addCollection(lucide);

createApp(App).use(router).mount("#app");

<template>
  <div class="app">
    <nav>
      <button :class="{ active: view === 'record' }" @click="view = 'record'">
        🎙 Registra
      </button>
      <button :class="{ active: view === 'notes' }" @click="view = 'notes'">
        📋 Note
      </button>
    </nav>
    <RecordView v-if="view === 'record'" @uploaded="switchToNotes" />
    <NotesView v-else />
  </div>
</template>

<script setup>
import { ref } from "vue";
import RecordView from "./views/RecordView.vue";
import NotesView from "./views/NotesView.vue";

const view = ref("record");

function switchToNotes() {
  view.value = "notes";
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5f5f7;
  color: #1d1d1f;
}

.app {
  max-width: 600px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

nav {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  padding: 0 16px;
}

nav button {
  flex: 1;
  padding: 14px;
  border: none;
  background: none;
  font-size: 15px;
  color: #8e8e93;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

nav button.active {
  color: #007aff;
  border-bottom-color: #007aff;
  font-weight: 600;
}
</style>

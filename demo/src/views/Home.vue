<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png">
    <HelloWorld msg="Welcome to Your Vue.js + TypeScript App"/>
    <a href="#" @click.prevent="go">go</a>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import HelloWorld from '@/components/HelloWorld.vue'; // @ is an alias to /src
import Worker from 'worker-loader!@/usb.worker.ts';
import '@/devices';

@Component({
  components: {
    HelloWorld,
  },
  mounted() {

  },
})
export default class Home extends Vue {
  async go() {
    await this.$devices.enumerate();
    await this.$devices.open(Object.keys(this.$devices.devices)[0]);
  }
}
</script>

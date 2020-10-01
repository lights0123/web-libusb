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
import Devices from '@/impl';

@Component({
  components: {
    HelloWorld,
  },
  mounted() {

  },
})
export default class Home extends Vue {
  async go() {
    const dev = await navigator.usb.requestDevice({filters:[{productId: 0xe012, vendorId: 0x0451}]});
    await dev.open();
    const worker = new Worker();
    const sab = new SharedArrayBuffer(2000);
    const devices = new Devices(sab);
    const id = devices.addDevice(dev);
    worker.postMessage([id, sab]);
    worker.onmessage = message => {
      devices.processCmd(message.data);
    };
  }
}
</script>

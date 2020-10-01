// const dev = await navigator.usb.requestDevice({filters:[{productId: 0xe012, vendorId: 0x0451}]});
// await dev.open();
// const worker = new Worker();
// const sab = new SharedArrayBuffer(2000);
// const devices = new Devices(sab);
// const id = devices.addDevice(dev);
// worker.postMessage([id, sab]);
// worker.onmessage = message => {
// 	devices.processCmd(message.data);
// };
type Cmd = {};

let count = 0;
export class Threads {
	threads: Record<number, {}> = {};
	process(cmd: Cmd) {

	}
}

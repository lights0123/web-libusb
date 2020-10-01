import { Component, Vue } from 'vue-property-decorator';
import { RpcProvider } from 'worker-rpc';
import UsbWorker from 'worker-loader!@/usb.worker.ts';
import UsbCompat from '@/impl';
/// The USB vendor ID used by all Nspire calculators.
const VID = 0x0451;
/// The USB vendor ID used by all non-CX and original CX calculators.
const PID = 0xe012;
/// The USB vendor ID used by all CX II calculators.
const PID_CX2 = 0xe022;

export type DevId = { address: number; busNumber: number };

export type Version = { major: number; minor: number; patch: number; build: number };
export type Lcd = { width: number; height: number; bpp: number; sample_mode: number };
export type HardwareType =
	| 'Cas'
	| 'NonCas'
	| 'CasCx'
	| 'NonCasCx'
	| { Unknown: number };
// The current state of the calculator.
export type RunLevel =
	| 'Recovery'
	| 'Os'
	| { Unknown: number };
export type Battery =
	| 'Powered'
	| 'Low'
	| 'Ok'
	| { Unknown: number };
export type Info = { free_storage: number; total_storage: number; free_ram: number; total_ram: number; version: Version; boot1_version: Version; boot2_version: Version; hw_type: HardwareType; clock_speed: number; lcd: Lcd; os_extension: string; file_extension: string; name: string; id: string; run_level: RunLevel; battery: Battery; is_charging: boolean };

export type FileInfo = { path: string; isDir: boolean; date: number; size: number };

export type Progress = { remaining: number; total: number };

export type PartialCmd = { action: 'download'; path: [string, number]; dest: string }
	| { action: 'upload'; path: string; src: string }
	| { action: 'uploadOs'; src: string }
	| { action: 'deleteFile'; path: string }
	| { action: 'deleteDir'; path: string }
	| { action: 'createDir'; path: string }
	| { action: 'move'; src: string; dest: string }
	| { action: 'copy'; src: string; dest: string };

export type Cmd = { id: number } & PartialCmd;

type WorkerExt = Worker & { rpc: RpcProvider };
export type Device = { device: USBDevice; name: string; isCxIi: boolean; needsDrivers: boolean; worker?: WorkerExt; info?: Info; progress?: Progress; queue?: Cmd[]; running?: boolean };

async function downloadFile(dev: RpcProvider, path: [string, number], dest: string) {
	await dev.rpc('downloadFile', { path, dest });
}

async function uploadFile(dev: RpcProvider, path: string, src: string) {
	await dev.rpc('uploadFile', { path, src });
}

async function uploadOs(dev: RpcProvider, src: string) {
	await dev.rpc('uploadOs', { src });
}

async function deleteFile(dev: RpcProvider, path: string) {
	await dev.rpc('deleteFile', { path });
}

async function deleteDir(dev: RpcProvider, path: string) {
	await dev.rpc('deleteDir', { path });
}

async function createDir(dev: RpcProvider, path: string) {
	await dev.rpc('createDir', { path });
}

async function move(dev: RpcProvider, src: string, dest: string) {
	await dev.rpc('move', { src, dest });
}

async function copy(dev: RpcProvider, src: string, dest: string) {
	await dev.rpc('copy', { src, dest });
}

async function listDir(dev: RpcProvider, path: string) {
	return await dev.rpc('listDir', { path }) as FileInfo[];
}

async function listAll(dev: RpcProvider, path: FileInfo): Promise<FileInfo[]> {
	if (!path.isDir) return [path];
	try {
		const contents = await listDir(dev, path.path);
		const parts: FileInfo[] = [];
		for (const file of contents) {
			parts.push(...(await listAll(dev, { ...file, path: `${path.path}/${file.path}` })));
		}
		parts.push(path);
		return parts;
	} catch (e) {
		console.error(path, e);
		return [];
	}
}

let queueId = 0;

@Component
class Devices extends Vue {
	devices: Record<string, Device> = {};

	created() {
	}

	async runQueue(dev: string) {
		const device = this.devices[dev];
		if (!device?.queue || !device.worker || device.running) return;
		const {rpc} = device.worker;
		this.$set(device, 'running', true);
		// eslint-disable-next-line no-constant-condition
		while (true) {
			// The device has been removed
			if (!this.devices[dev]) return;

			const cmd = device.queue[0];
			if (!cmd) {
				device.running = false;
				return;
			}
			try {
				if (cmd.action === 'download') {
					await downloadFile(rpc, cmd.path, cmd.dest);
				} else if (cmd.action === 'upload') {
					await uploadFile(rpc, cmd.path, cmd.src);
				} else if (cmd.action === 'uploadOs') {
					await uploadOs(rpc, cmd.src);
				} else if (cmd.action === 'deleteFile') {
					await deleteFile(rpc, cmd.path);
				} else if (cmd.action === 'deleteDir') {
					await deleteDir(rpc, cmd.path);
				} else if (cmd.action === 'createDir') {
					await createDir(rpc, cmd.path);
				} else if (cmd.action === 'move') {
					await move(rpc, cmd.src, cmd.dest);
				} else if (cmd.action === 'copy') {
					await copy(rpc, cmd.src, cmd.dest);
				}
			} catch (e) {
				console.error(e);
			}
			if ('progress' in device) this.$delete(device, 'progress');
			device.queue.shift();
			await this.update(dev);
		}
	}

	private addToQueue(dev: string, ...cmds: PartialCmd[]) {
		const device = this.devices[dev];
		if (!device) return;
		if (!device.queue) {
			this.$set(device, 'queue', []);
		}
		device.queue?.push(...cmds.map(cmd => ({ ...cmd, id: queueId++ } as Cmd)));
		this.runQueue(dev);
	}

	async enumerate() {
		if (!navigator.usb) return;
		const device = await navigator.usb.requestDevice({
			filters: [{ vendorId: VID, productId: PID }, {
				vendorId: VID,
				productId: PID_CX2,
			}],
		});
		this.$set(this.devices, queueId++, {
			device,
			name: device.productName,
			isCxIi: device.productId === PID_CX2,
			needsDrivers: false,
		} as Device);
	}

	async open(dev: string) {
		const device = this.devices[dev].device;
		await device.open();
		const worker: Worker & Partial<WorkerExt> = new UsbWorker();
		const sab = new SharedArrayBuffer(10000);
		const compat = new UsbCompat(sab);
		const id = compat.addDevice(device);
		const rpc = new RpcProvider((message, transfer: any) => worker.postMessage(message, transfer));
		worker.rpc = rpc;
		worker.onmessage = ({ data }) => {
			if('usbCmd' in data) return compat.processCmd(data);
			rpc.dispatch(data);
		}
		this.$set(this.devices[dev], 'worker', worker as WorkerExt);

		rpc.rpc('init', {id, sab, vid: device.vendorId, pid: device.productId});
		await this.update(dev);
	}

	async close(dev: string) {
		const device = this.devices[dev];
		device.worker?.terminate();
		await device.device.close();
		this.$delete(this.devices, dev);
	}

	async update(dev: string) {
		const info = await this.devices[dev].worker?.rpc.rpc('updateDevice');
		this.$set(this.devices[dev], 'info', info);
	}

	async listDir(dev: string, path: string) {
		const worker = this.devices[dev].worker;
		if(!worker) return [];
		return await listDir(worker.rpc, path);
	}

	async promptUploadFiles(dev: string, path: string) {
		const files = await promisified({ cmd: 'selectFiles', filter: ['tns'] }) as string[];
		for (const src of files) {
			this.addToQueue(dev, { action: 'upload', path, src });
		}
	}

	async uploadOs(dev: string, filter: string) {
		const src = await promisified({ cmd: 'selectFile', filter: [filter] }) as string | null;
		if (!src) return;
		this.addToQueue(dev, { action: 'uploadOs', src });
	}

	async downloadFiles(dev: string, files: [string, number][]) {
		const dest = await promisified({ cmd: 'selectFolder' }) as string | null;
		if (!dest) return;
		for (const path of files) {
			this.addToQueue(dev, { action: 'download', path, dest });
		}
	}

	async delete(dev: string, files: FileInfo[]) {
		const toDelete: FileInfo[] = [];
		for (const file of files) {
			toDelete.push(...await listAll(dev, file));
		}
		for (const file of toDelete) {
			this.addToQueue(dev, { action: file.isDir ? 'deleteDir' : 'deleteFile', path: file.path });
		}
	}

	async createDir(dev: string, path: string) {
		this.addToQueue(dev, { action: 'createDir', path });
	}

	async copy(dev: string, src: string, dest: string) {
		this.addToQueue(dev, { action: 'copy', src, dest });
	}

	async move(dev: string, src: string, dest: string) {
		this.addToQueue(dev, { action: 'move', src, dest });
	}
}


const devices = new Devices();
export default devices;
Vue.prototype.$devices = devices;
declare module 'vue/types/vue' {
	// 3. Declare augmentation for Vue
	interface Vue {
		$devices: Devices;
	}
}

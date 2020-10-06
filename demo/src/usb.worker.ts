import { RpcProvider } from 'worker-rpc';
import type { Calculator } from '../../web-libnspire/pkg';

console.log('worker!');
const ctx: Worker = self as any;
const module = import('../../web-libnspire/pkg');
let calc: Calculator | undefined;
const rpcProvider = new RpcProvider(
	(message, transfer: any) => ctx.postMessage(message, transfer)
);
ctx.onmessage = e => rpcProvider.dispatch(e.data);

type SinglePath = { path: string };

rpcProvider.registerRpcHandler('init', async ({ id, sab, vid, pid }) => {
	if (calc) calc.free();
	calc = new (await module).Calculator(id, vid, pid, new Int32Array(sab));
});

rpcProvider.registerRpcHandler('updateDevice', () => {
	return calc?.update();
});

rpcProvider.registerRpcHandler('downloadFile', ({ path, dest }) => {

});

rpcProvider.registerRpcHandler('uploadFile', ({ path, src }) => {

});

rpcProvider.registerRpcHandler('uploadOs', ({ src }) => {

});

rpcProvider.registerRpcHandler<SinglePath>('deleteFile', ({ path }) => {
	calc?.delete_file(path);
});

rpcProvider.registerRpcHandler<SinglePath>('deleteDir', ({ path }) => {
	calc?.delete_dir(path);
});

rpcProvider.registerRpcHandler<SinglePath>('createDir', ({ path }) => {
	calc?.create_dir(path);
});

rpcProvider.registerRpcHandler('move', ({ src, dest }) => {
	calc?.move_file(src, dest);
});

rpcProvider.registerRpcHandler('copy', ({ src, dest }) => {
	calc?.copy_file(src, dest);
});

rpcProvider.registerRpcHandler<SinglePath>('listDir', ({ path }) => {
	return calc?.list_dir(path);
});

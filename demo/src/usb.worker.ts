console.log('worker!');
const ctx: Worker = self as any;
let hasInit = false;
let int32Array;
ctx.onmessage = message => {
	if (hasInit) return;
	hasInit = true;
	import('../../web-link/pkg').then(module => {
		console.log(message.data[1]);
		const calc = new module.Calculator(message.data[0], 0, 0, new Int32Array(message.data[1]));
		console.log(calc.list_dir('/'));
	});
};

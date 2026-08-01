declare module "node-notifier" {
	interface NotifyOptions {
		title?: string;
		message?: string;
		sound?: boolean | string;
		icon?: string;
	}
	function notify(options: NotifyOptions, callback?: (err: Error | null, response: string) => void): void;
	const _default: { notify: typeof notify };
	export default _default;
}

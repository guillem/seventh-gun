export const minimumChromeVersion: string;
export function assertBrowserVersion(version: string): void;
export function launchBrowser(options?: { args?: string[] }): Promise<import("playwright").Browser>;
export default function checkBrowser(): Promise<void>;

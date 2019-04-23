
let startTime = Date.now();
let reqCount = 0;

let seconds = 0;
setInterval(() => seconds++, 1000);


export default function(): string {
  const uptime = Date.now() - startTime;
  return `This is an API server. Please make requests against an endpoint. This server uptime: ${(uptime/1000).toFixed(2)}s and ${seconds} ticks and this page has been requested ${++reqCount} times`
}
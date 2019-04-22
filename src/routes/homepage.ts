
let startTime = Date.now();
let reqCount = 0;


export default function(): string {
  const uptime = Date.now() - startTime;
  return `This is an API server. Please make requests against an endpoint. This server uptime: ${uptime}ms and this page has been requested ${++reqCount} times`
}
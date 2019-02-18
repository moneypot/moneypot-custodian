import http from "http";
import nonce from "./routes/nonce";
import readJson from "./util/read-json";
import { claim } from "./routes/claim";
import spentCoin from "./routes/spent-coin";
import routeHookin from "./routes/hookin";
import transferC2C from "./routes/transfer/c2c";
import transferC2H from "./routes/transfer/c2h";
import transferH2C from "./routes/transfer/h2c";


const hostname = "127.0.0.1";
const port = 3030;


async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {

    const url = req.url;
    if (url === undefined) {
        throw new Error("404: missing url");
    }

    if (url === "/nonce") {
        return nonce();
    } else if (url.startsWith("/hookin/")) {
        return routeHookin(url);
    } else if (url.startsWith("/spent-coin/")) {
        return spentCoin(url);
    }

    if (req.method === "POST") {
        const body = await readJson(req);
        switch (url) {
            case "/claim":
                return await claim(body);
            case "/transfer/c2c":
                return await transferC2C(body);
            case "/transfer/c2h":
                return await transferC2H(body);
            case "/transfer/h2c":
                return await transferH2C(body);
        }
    }
}


async function constTime<T>(ms: number, f: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const result = await f();
    const endTime = Date.now();

    const duration = endTime - startTime;
    let sleep = 0;

    if (duration > ms) {
        console.log("constTime'd function took ", duration, "ms, but should've finished under ", ms);
    } else {
        sleep = ms - duration;
    }
    await new Promise((resolve) => setTimeout(resolve, sleep));
    return result
}



let reqCounter = 0;


const server = http.createServer(async (req, res) => {
    const start = Date.now();

    const reqCount = ++reqCounter;
    console.log(`--> ${req.method} ${req.url} req=${reqCount}`);

    let r;
    try {
        const result = await runner(req, res);
        if (result === undefined) {
            res.statusCode = 404;
            r = `"ROUTE_NOT_FOUND"`;
        } else {
            r = JSON.stringify(result);
        }
    } catch (err) {
        if (typeof err === "string") {
            r = JSON.stringify(err);
            res.statusCode = err === "RETRY_NONCE" ? 503 : 400;
        } else {
            console.error("caught exception: ", err);
            res.statusCode = 500;
            r = '"internal error"';
        }

    
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const end = Date.now();

    console.log(`<-- ${req.method} ${req.url} req=${reqCount} status=${res.statusCode} time=${end-start}ms`);

    res.end(r);
});


server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
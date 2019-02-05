import http from "http";
import nonce from "./routes/nonce";
import readJson from "./util/read-json";
import { claim } from "./routes/claim";
import transfer from "./routes/transfer";
import spentCoin from "./routes/spent-coin";
import transactionHookin from "./routes/transaction-hookin";

const hostname = "127.0.0.1";
const port = 3030;


async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {

    const url = req.url;
    if (url === undefined) {
        throw new Error("404: missing url");
    }


    if (url === "/nonce") {
        return nonce();
    } else if (url.startsWith("/transaction-hookin/")) {
        return transactionHookin(url);
    } else if (url.startsWith("/spent-coin/")) {
        return spentCoin(url);
    }

    if (req.method === "POST") {
        const body = await readJson(req);
        switch (url) {
            case "/claim":
                return await claim(body);
            case "/transfer":
                return (await transfer(body)).toBech();
        }
    }
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
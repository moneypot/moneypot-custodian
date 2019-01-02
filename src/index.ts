import http from "http";
import declare from "./routes/declare";
import nonce from "./routes/nonce";
import readJson from "./util/read-json";
import { claim } from "./routes/claim";

const hostname = "127.0.0.1";
const port = 3030;


async function runner(req: http.IncomingMessage, res: http.ServerResponse): Promise<any> {

    if (req.url === "/nonce") {
        return nonce();
    }

    if (req.method === "POST") {
        const body = await readJson(req);
        switch (req.url) {
            case "/claim":
                const claimed = await claim(body);
                return claimed.toPOD();
            case "/declare":
                const transaction = await declare(body);
                return transaction.toPOD();
            case "/submit-transaction":
              //  await submitTransaction(body);
        }
    }

    throw new Error("404: unknown route")
}

let reqCounter = 0;


const server = http.createServer(async (req, res) => {
    const start = Date.now();

    const reqCount = ++reqCounter;
    console.log(`--> ${req.method} ${req.url} req=${reqCount}`);

    let r;
    try {
        const result = await runner(req, res);
        r = JSON.stringify(result);
    } catch (err) {
        if (typeof err === "string") {
            r = JSON.stringify(err);
            res.statusCode = err === "NO_SUCH_NONCE" ? 503 : 400;
        } else {
            console.error("caught exception: ", err);
            res.statusCode = 500;
            r = '"internal error"';
        }

    
    }

    res.setHeader("Content-Type", "application/json");

    const end = Date.now();

    console.log(`<-- ${req.method} ${req.url} req=${reqCount} status=${res.statusCode} time=${end-start}ms`);

    res.end(r);
});


server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
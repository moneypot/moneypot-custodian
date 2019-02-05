import * as hi from "hookedin-lib";
import lookupTransactionHookin from "../db/lookup-transaction-hookin";

export default async function(url: string) {
    const hookinHash = url.substring("/transaction-hookin/".length);
    return await lookupTransactionHookin(hookinHash);     
}
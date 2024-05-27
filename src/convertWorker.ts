import { getImageData } from "./dicomUtils";
import { parentPort } from 'worker_threads';

parentPort.on("message", async m => {
    parentPort.postMessage({out: await getImageData(m.data)});
});
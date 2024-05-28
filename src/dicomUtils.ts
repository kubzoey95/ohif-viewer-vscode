import * as tf from '@tensorflow/tfjs-node';
import { OpenJPEGWASM } from './codec-openjpeg';

import { getJpegData } from './getjpeg';

import * as dicomParser from 'dicom-parser';
import * as daikon from 'daikon';

export const getImageId = (dcm: dicomParser.DataSet) => {
    return parseFloat(dcm.string('x00200032')?.split("\\").at(-1) || '0');
};

// @ts-ignore
const openjpeg = new OpenJPEGWASM();
// @ts-ignore
const getDcmImage = async image => {
    const bitsAllocated = image.getBitsAllocated();
    const cols = image.getCols();
    const rows = image.getRows();
    // @ts-ignore
    const arrayType = bitsAllocated > 16 ? Float32Array : {16: Int16Array, 8: Int8Array}[bitsAllocated];
    const slope = image.getDataScaleSlope() || 1;
    const intercept = image.getDataScaleIntercept() || 0;

    let pixelDataConverted = undefined;

    if (image.isCompressedJPEG2000()) {
        const jpegData = getJpegData(image)[0];
        
        const decoder = new (await openjpeg).J2KDecoder();
        const pixelData = new Uint8Array(jpegData.buffer);
        const encodedBuffer = decoder.getEncodedBuffer(pixelData.length);
        encodedBuffer.set(pixelData);
        decoder.decode();
        pixelDataConverted = new arrayType(decoder.getDecodedBuffer().buffer);
    }
    else{
        pixelDataConverted = image.getInterpretedData();
    }
    //@ts-ignore
    let out = tf.tensor(Array.from(pixelDataConverted)).reshape([cols, rows, 1]);
    out = out.mul(slope).add(intercept);
    return out;
};

const arrayToRGBA = (array: tf.Tensor) => {
    let out = array.sub(array.min());
    out = tf.round(out.mul(tf.scalar(255).div(out.max())));
    out = tf.concat([out, out, out, tf.onesLike(out).mul(tf.scalar(255))], -1);
    return out;
};
export const getImageData = async (buff: Uint8Array) => {
    const dcm = dicomParser.parseDicom(buff, {untilTag: 'x00200032'});
    const id = getImageId(dcm);
    const image = await getDcmImage(daikon.Series.parseImage(new DataView(buff.buffer)));
    return [id, image.shape, new Uint8ClampedArray(await arrayToRGBA(image).flatten().array())];
};

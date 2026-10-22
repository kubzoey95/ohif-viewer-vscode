const dcmjs = require('dcmjs');

function dicom(series, instance, index = 0, overrides = {}) {
    const data = new dcmjs.data.DicomDict(dcmjs.data.DicomMetaDictionary.denaturalizeDataset({
        TransferSyntaxUID: '1.2.840.10008.1.2.1',
        MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        MediaStorageSOPInstanceUID: instance,
    }));
    data.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset({
        StudyInstanceUID: '1.2.3', SeriesInstanceUID: series, SOPInstanceUID: instance,
        _vrMap: { PixelData: 'OW' },
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.2', Modality: 'CT', PatientID: 'test',
        Rows: 2, Columns: 2, PixelData: new Uint16Array([0, 100, 200, 300]).buffer,
        PixelSpacing: [1, 1], ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
        ImagePositionPatient: [0, 0, index], InstanceNumber: index + 1, WindowCenter: 150, WindowWidth: 300, BitsAllocated: 16, BitsStored: 16, HighBit: 15,
        PixelRepresentation: 0, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2', ...overrides,
    });
    return Buffer.from(data.write());
}

module.exports = { dicom };

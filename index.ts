import { Response, Request } from "express";
const { Storage } = require('@google-cloud/storage');
const bucketName = "jobby-cvs";
const httpService = require('request-promise-native');
var firebase = require("firebase-admin");
const uuidGenerator = require('uuid/v4');

exports.vaiPOST = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method == "OPTIONS") return handleOptions(res, req);

  let jobOfferId = req.header('jobOfferId');
  let jobOfferOwnerId = req.header('jobOfferOwnerId');
  let fileDisplayName = req.header('fileDisplayName');

  if (!jobOfferId || !jobOfferOwnerId || !fileDisplayName) return res.status(400).send('Missing required headers');


  getUser(req).then((usr: any) => {
    const uuid = uuidGenerator();

    if (firebase.apps.length === 0) firebase.initializeApp();


    getSignedUploadUrl(usr.uuid + "/" + uuid, usr.uuid, jobOfferId, jobOfferOwnerId, fileDisplayName).then(url => {
          return res.status(200).send(url);
    })
      .catch((err) => console.error(err));

  }
  )
    .catch((err) => {
      console.error(err);
      return res.status(401).send(err);
    });
}

exports.vaiPERMIT = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method == "OPTIONS") return handleOptions(res, req);

  let jobOfferId = req.header('jobOfferId');
  let jobOfferOwnerId = req.header('jobOfferOwnerId');

  let filename = req.header('filename');

  if (!jobOfferId || !filename) return res.status(400).send('Missing required headers');


  getUser(req).then(async (usr: any) => {
    if (firebase.apps.length === 0) firebase.initializeApp();

    let file = await findFileForUser(usr.uuid, filename);
    if (!file) return res.status(404).send('File not found');

    firebase.firestore().collection('cvs').doc(usr.uuid).collection('files').doc(jobOfferId).set({
     filename, jobOfferOwnerId, fileDisplayName: file.data().fileDisplayName
    }).then((_) => {
      return res.status(200).end();
    })
  }
  )
    .catch((err) => {
      console.error(err);
      return res.status(401).send(err);
    });
}

exports.vaiGET = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method == "OPTIONS") return handleOptions(res, req);

  const jobOfferId = req.header('jobOfferId');
  const cvOwner = req.header('targetUser');

  if (!jobOfferId || !cvOwner) return res.status(400).send('Missing required headers');

  getUser(req).then(async (usr: any) => {
    let uuid = usr.uuid;

    if (firebase.apps.length === 0) firebase.initializeApp();

    if (!(await hasFilePermissions(uuid, jobOfferId, cvOwner))) {
      console.log("Failed to get file perm");
      return res.status(401).send("No permission to access file");
    }

    const fileName = await getFileName(jobOfferId, cvOwner);

    getSignedDownloadUrl(fileName)
      .then((url) => {
        console.log("success");
        console.log(url);
        return res.status(200).send(url);
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).send(err);

      });
  }
  )
    .catch((err) => {
      console.error(err);
      return res.status(401).send(err);
    });
}


exports.vaiGETMINE = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method == "OPTIONS") return handleOptions(res, req);

  getUser(req).then((usr: any) => {
    if (firebase.apps.length === 0) firebase.initializeApp();
    firebase.firestore().collection('cvs').doc(usr.uuid).collection('files').get().then(files => {
      console.log('file status:' + files.empty);
      console.log(files);
      if (files.empty) return res.status(204).end();

      const fileObjects = [];

       files.forEach( doc => {

        const url = (getSignedDownloadUrl(doc.data().filename))[0];
        fileObjects.push({url, fileDisplayName: doc.data().fileDisplayName, fileName: doc.data().filename});
        console.log('pushed:');
        console.log(fileObjects);
        console.log('url:');
        console.log(url);
        console.log('filedisplayname:');
        console.log(doc.data().fileDisplayName);
        console.log('filename:');
        console.log(doc.data().filename);
      });

      console.log('sending: ');
      console.log(fileObjects);
      res.status(200).send(fileObjects);
    })
  })
    .catch((err) => {
      console.error(err);
      return res.status(401).send(err);
    });
}

exports.onCVUpload = (file: any) => {
  console.log(`  File: ${file.name}`);
  console.log(`  Metageneration: ${file.metageneration}`);
  console.log(file);

  if (firebase.apps.length === 0) firebase.initializeApp();
  const subconfig = JSON.parse(file.metadata.subconfig);
  console.log(subconfig);
  const jobOfferFileRef = firebase.firestore().collection('cvs').doc(subconfig.ownerId).collection('files').doc(subconfig.jobOfferId);
  jobOfferFileRef.set({ filename: file.name, jobOfferOwnerId: subconfig.jobOfferOwnerId, fileDisplayName: subconfig.fileDisplayName })
    .then((result) => {
      console.log("success");
      console.log(result);
    })
    .catch((err) => {
      console.error(err);
    });
}

async function hasFilePermissions(requesterId: String, jobOfferId: String, ownerId: String) {
  var jobOfferFileRef = firebase.firestore().collection('cvs').doc(ownerId).collection('files').doc(jobOfferId);
  const file = await jobOfferFileRef.get();

  if (file.exists) {
    if (requesterId == ownerId) {
      return true;
    }
    if (file.data().jobOfferOwnerId = requesterId) {
      return true;
    }
  }
  return false;
}

async function getFileName(jobOfferId: String, ownerId: String): Promise<any>{
  var jobOfferFileRef = firebase.firestore().collection('cvs').doc(ownerId).collection('files').doc(jobOfferId);

  var file = await jobOfferFileRef.get();

  return file.data().filename;
}

async function findFileForUser(uuid: String, filename: String) {
const files = await firebase.firestore().collection('cvs').doc(uuid).collection('files').get();

  if (files.empty) return false;

  let foundFile: any = false;
  files.forEach(file => {
    if (file.data().filename == filename) {
      foundFile = file;
    }
  })
    return foundFile;
  }

async function getSignedUploadUrl(filename: String, ownerId: String, jobOfferId: String, jobOfferOwnerId: String, fileDisplayName: String) {
  const storage = new Storage();

  const fileHandle = storage.bucket(bucketName).file(filename);

  const expirationTimeInMilliseconds = Date.now() + 150000;
  const subconfig = {fileDisplayName, ownerId, jobOfferId, jobOfferOwnerId}
  const uploadConfig = {
    action: 'write',
    destination: filename,
    origin: '*',
    contentType: 'application/pdf',
    expires: expirationTimeInMilliseconds,
    extensionHeaders: {
    //   'x-goog-meta-cache-control': 'public, max-age=31557600',
       'x-goog-meta-subconfig': JSON.stringify(subconfig),
     //   'x-goog-meta-jobofferownerid': jobOfferOwnerId
    }
  };

  console.log(uploadConfig);
  console.log('ownerid = "' + ownerId + '"');
  console.log('jobofferid = "' + jobOfferId + '"');
  console.log(fileDisplayName);
  console.log(ownerId);
  console.log(jobOfferId);
  console.log(jobOfferOwnerId);

  return fileHandle.getSignedUrl(uploadConfig);
}

async function getSignedDownloadUrl(filename: String) {
  const storage = new Storage();

  console.log(filename);
  const fileHandle = storage.bucket(bucketName).file(filename);

  const expirationTimeInMilliseconds = Date.now() + 3600000;
  const downloadConfig = {
    action: 'read',
    expires: expirationTimeInMilliseconds,
  };

  return await fileHandle.getSignedUrl(downloadConfig);
}

async function handleOptions(res: Response, req: Request) {
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers'));
  res.header('Access-Control-Allow-Methods', req.header('Access-Control-Request-Method'));

  res.status(204).end();
}

async function getUser(req: Request) {
  return new Promise((resolve, reject) => {

    const token = req.header('authentication');
    if (!token) {
      return reject("No token sent");
    }

    const headers = { 'authentication': token };
    const options = {
      uri: 'https://api-dot-pts6-bijbaan.appspot.com/auth/me',
      method: 'GET',
      headers,
      json: true,
    }

    httpService(options).then((res) => resolve({res})
    ).catch((err) => reject(err));
  });
}
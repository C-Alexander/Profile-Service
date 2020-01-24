import { Response, Request } from "express";
var firebase = require("firebase-admin");
require('dotenv').config()
import { MongoClient } from 'mongodb'
let lastCachedProfileTime = Date.now();
let cachedProfiles;

const mongoDbConnection = () => MongoClient.connect(process.env.MONGODB)

exports.submitProfile = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method == "OPTIONS") return handleOptions(res, req);

  let profileData = req.header('profileData');
  profileData['DateAdded'] = Date.now();

  if (firebase.apps.length === 0) firebase.initializeApp();

  createProfile(profileData)
  .then((result) => {
    console.log("success");
    res.status(201).send(result);
    console.log(result);
  })
  .catch((err) => {
    res.status(500).send(err);
    console.error(err);
  });
}

exports.getProfiles = (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method == "OPTIONS") return handleOptions(res, req);

  if (firebase.apps.length === 0) firebase.initializeApp();

  let amountToGet: any = req.query.count;
  if (amountToGet == null) amountToGet = 100;
   else amountToGet = parseInt(amountToGet);

  if (amountToGet == 0) {
    return res.status(204).json([]);
  }
  // const profiles = [];
  console.log(lastCachedProfileTime);
  console.log(Date.now() -  lastCachedProfileTime);
  if (Date.now() - lastCachedProfileTime > 30000 || !cachedProfiles || cachedProfiles.length < amountToGet) {
    console.log("Caching profiles!");
    sendAndCacheProfiles(amountToGet, res); 
  } else {
    console.log("Sending cached profiles!");
    if (cachedProfiles.length == 0) {
      res.status(204).json([]);
    } else {
    res.status(200).json(cachedProfiles.slice(0, amountToGet));
    }
  }
  
  // getProfiles(amountToGet).then((rows) => {
  //   console.log("got profiles");
  //   rows.forEach(profile => {
  //     let profData = profile.data();
  //     console.log(profData);
  //     profiles.push(profData);
  //  });
  //   res.status(200).send(profiles);
  //   console.log(profiles);
  // })
  // .catch((err) => {
  //   res.status(500).send(err);
  //   console.error(err);
  // });
}

function sendAndCacheProfiles(amountToGet, res) {
  mongoDbConnection()
  .then(
    (client) => 
      client.db('PixelPeople').collection('User')
      .find()
      .sort({ $natural: -1 })
      .limit(amountToGet)
      .toArray()
      .then(profiles => ({client, profiles}))
  )
  .then(({client, profiles}) => {
    lastCachedProfileTime = Date.now();
    client.close()
    cachedProfiles = profiles;
    return profiles
  })
  .then(profiles => { 
    res.json(profiles);
  })
  .catch(error => res.status(500).send(error.toString()))
}

async function getProfiles(amountToGet: String) {
  return firebase.firestore().collection('profiles').orderBy("DateAdded", "desc").limit(amountToGet).get();
}

async function handleOptions(res: Response, req: Request) {
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers'));
  res.header('Access-Control-Allow-Methods', req.header('Access-Control-Request-Method'));

  res.status(204).end();
}

async function createProfile(data: any) {
  const profileDoc = firebase.firestore().collection('profiles').doc();
  return profileDoc.set(data);
}
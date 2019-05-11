//GLOBAL SETTINGS
/****************************************************************/
const bodyParser = require("body-parser");
const functions = require('firebase-functions');
const _crypto = require('crypto');
const admin = require('firebase-admin');
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const wjob_url:string = "www.wjobfm.com";
//smtp : stands for Simple Mail Transfer Protoal
const smtpConfig = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: functions.config().email.user,
        pass: functions.config().email.pass,  
    }
};
//commented out inorder to test functionality with
//configured credentials embed in the runtime environment
const serviceaccount = 
    require('./wjob-staging-firebase-adminsdk-2bfqk-4c66239acf.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceaccount)
//  ,databaseURL: "https://wjob-staging.firebaseio.com"
});
//admin.initializeApp(functions.config().firebase);
/*****************************************************************/

//VERIFY
/*****************************************************************/
exports.verify = functions.https.onRequest((req:any, res:any) => {
    return Promise.resolve().then(()=>{
        //retrieve docID from query param named hash
        let docID = req.query.hash;
        //retrieve reference to the database
        let db = admin.firestore();
        //access doc with that id from unverified collection
        let doc = db.collection('unverified-emails').doc(docID);
        //waits for database to respond with a snapshot of the doc
        doc.get().then((snapshot:any) => {
            //if the doc exists
            if (snapshot.exists) {
                // add a copy of that doc to the verified emails collection
                db.collection('verified-emails').doc(docID).set(snapshot.data());
                //duplicate the data to a doc that compiles all emails
                //this will lower overall read/writes from the database
                let data = {} as any;
                data[docID] = snapshot.data().email;
                db.collection('verified-emails').doc('compiledEmails').get().then((compiledEmails:any)=>{
                    db.collection('verified-emails').doc('compiledEmails').set({...data, ...compiledEmails.data()});
                });
                //then remove the original copy from the unverified emails collection
                doc.delete();
            }
            //return a successful execution status to the client that called this cloud function's url
            res.status(200).send('Your email has been verified ^__^')
                //then terminate the connection
                .end();
        });
    })
})

/*****************************************************************/

//MAIL
/*****************************************************************/

exports.formCompatibleMailAll = functions.https.onRequest((req:any, res:any) => {
    return Promise.resolve().then(()=>{
        //initialize an email service
        let transporter = nodemailer.createTransport(smtpConfig);
        //retrieve reference to the database
        let db = admin.firestore();
        //access doc with the compiled list of verified emails
        let doc = db.collection('verified-emails').doc('compiledEmails');
        //waits for database to respond with a snapshot of the doc
        doc.get().then((snapshot:any) => {
            //set the text and metadata of a verification email
            for (let key in snapshot.data()){
                let mailOptions = {
                    from: "wjobnotifs@gmail.com",
                    to: snapshot.data()[key],
                    subject: "WJOB Newsletter",
                    html:req.query.text+"<br><a href='https://us-central1-wjob-staging.cloudfunctions.net/unsub"+'?hash='+key+"'>Didn't Mean to Sign Up?</a>" 
                };
                //send a verification email to the provided email address
                transporter.sendMail(mailOptions, function (error:any, response:any) {
                    //log an error if the email failed to send
                    if (error) {console.log(error);}
                    //log a success if the email reachs it's destination
                    else {console.log("Message sent: " + snapshot.data()[key]);}
                    //disconnect from email service
                });
            }
            transporter.close();
            //return a successful execution status to the client that called this cloud function's url
            res.status(200)
                //then terminate the connection
                .end();
        });
    });
});
/*****************************************************************/

//UNVERIFIED
/*****************************************************************/
exports.createUnverified = functions.https.onRequest((req:any, res:any) => {
    return Promise.resolve().then(()=>{
        //retrieve demographic information from  query params
        let {email, name, age} = req.query;
        //generate a unique hash from the demographic information
        let hash = _crypto.createHash('md5').update(email+name+age).digest("hex");
        //create a unique link to verify the email address using the above hash
        let link = "https://us-central1-wjob-staging.cloudfunctions.net"+'/verify?hash='+hash;
        //create a unique link to unsubscribe the email address using the above hash
        let unsublink = "https://us-central1-wjob-staging.cloudfunctions.net"+'/unsub?hash='+hash;
        //create a document in the unverified-emails collection 
        admin.firestore().collection('unverified-emails')
            //use the generated hash to label the document
            .doc(hash)
            //add the demographic info and email to the document
            .set({
                'email':email,
                'name':name,
                'age':age,
                'verification-link':link
            });
        //initialize an email service
        let transporter = nodemailer.createTransport(smtpConfig);
        //set the text and metadata of a verification email
        let mailOptions = {
            from: "wjobnotifs@gmail.com",
            to: email,
            subject: "Email verification",
            html: 
                "Welcome to WJOB's newletter mailing list! Thank you for becoming part of our community. ^__^"
                + "<br>"
                + "<a href='"+link+"'>Verify Email Address</a>" 
                + "<br>"
                + "<a href='"+unsublink+"'>Didn't Mean to Sign Up?</a>" 
        };
        //send a verification email to the provided email address
        transporter.sendMail(mailOptions, function (error:any, response:any) {
            //log an error if the email failed to send
            if (error) {console.log(error);}
            //log a success if the email reachs it's destination
            else {console.log("Message sent: " + email);}
            //disconnect from email service
            transporter.close();
            //return a successful execution status to the client that called this cloud function's url
            res.status(200)
                //then terminate the connection
                .end();
        });
    });
});
/*****************************************************************/

//UNSUBSCRIBE
/*****************************************************************/
exports.unsub = functions.https.onRequest((req:any, res:any) => {
    return Promise.resolve().then(()=>{
        //retrieve docID from query param named hash
        let docID = req.query.hash;
        //retrieve reference to the database
        let db = admin.firestore();
        //access doc with that id from verified collection
        let doc = db.collection('verified-emails').doc(docID);
        //waits for database to respond with a snapshot of the doc
        doc.get().then((snapshot:any) => {
            //if the doc exists
            if (snapshot.exists) {
                // rempve that copy of the doc from the verified emails collection
                db.collection('verified-emails').doc(docID).delete();
                //filter out the duplicate of the data to a doc that compiles all emails
                db.collection('verified-emails').doc('compiledEmails').get().then((compiledEmails:any)=>{
                    let data = {} as any;
                    for (let key in snapshot.data()){
                        if (key != docID){
                            data[key]=snapshot.data()[key];
                        }
                    }
                    db.collection('verified-emails').doc('compiledEmails').set(data);
                });
            }
            //return a successful execution status to the client that called this cloud function's url
            res.status(200).send("You've successfully unsubscribed from the WJOB FM newsletter.")
                //then terminate the connection
                .end();
        });
    })
})
/*****************************************************************/
//exports.cronJobCheckMail = functions.https.onRequest((req:any, res:any) => 
//    return Promise.resolve().then(()=>{

        //check is an existing auth token is in the firestore
        //check if it is expired
        //if not, fetch emails from today, crossreferenced with the whitelisted emails as senders
        // send out to patrons
        //if no token or TokenExpiredError, redirect towards gmail auth for token
        //  , emailing an admin a link to reauth this application
//    });
//});
/*****************************************************************/
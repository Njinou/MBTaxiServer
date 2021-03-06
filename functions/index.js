const functions = require("firebase-functions");
// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
const turf = require('@turf/turf');
//import * as turf from "@turf/turf";
admin.initializeApp();
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.

// Take the text parameter passed to this HTTP endpoint and insert it into 
// Firestore under the path /messages/:documentId/original
exports.addMessage = functions.https.onRequest(async (req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into Firestore using the Firebase Admin SDK.
    const writeResult = await admin.firestore().collection('messages').add({original: original});
    // Send back a message that we've successfully written the message
    res.json({result: `Message with ID: ${writeResult.id} added.`});
  });


  // Listens for new messages added to /messages/:documentId/original and creates an
// uppercase version of the message to /messages/:documentId/uppercase
exports.makeUppercase = functions.firestore.document('/messages/{documentId}')
.onCreate((snap, context) => {
  // Grab the current value of what was written to Firestore.
  const original = snap.data().original;

  // Access the parameter `{documentId}` with `context.params`
  functions.logger.log('Uppercasing', context.params.documentId, original);
  
  const uppercase = original.toUpperCase();
  
  // You must return a Promise when performing asynchronous tasks inside a Functions such as
  // writing to Firestore.
  // Setting an 'uppercase' field in Firestore document returns a Promise.
  return snap.ref.set({uppercase}, {merge: true});
});


exports.makeUppercaseTest = functions.database.ref('/messages/{pushId}/{original}')
    .onCreate((snapshot, context) => {
      // Grab the current value of what was written to the Realtime Database.
      const original = snapshot.val();
      functions.logger.log('Uppercasing', context.params.pushId, original);
      const uppercase = original.toUpperCase();
      // You must return a Promise when performing asynchronous tasks inside a Functions such as
      // writing to the Firebase Realtime Database.
      // Setting an "uppercase" sibling in the Realtime Database returns a Promise.
      return snapshot.ref.parent.child('uppercase').set(uppercase);
    });

    //beginning of functions not embedded.....
    function compareDistance(a, b) {
      //properties
      return a.properties.distanceToPoint - b.properties.distanceToPoint;
    }


    function sortingArray (a,b){
      return a-b;
     }
    function neighborPointMod(
      targetPoint,points) {
        // Input validation
      if (!targetPoint) throw new Error("targetPoint is required");
      if (!points) throw new Error("points is required");
      
      let finalArray = [];
      let arraySize = points.features.length<=10? points.features.length: 10;
      var neighborArray =  new Array(arraySize);
      for (j=0 ; j <neighborArray.length; j++){

        neighborArray[j] = turf.clone(points.features[j]);
        neighborArray[j].properties.featureIndex = j;
        neighborArray[j].properties.distanceToPoint = turf.distance(targetPoint, neighborArray[j]);
      }
      
      neighborArray = neighborArray.sort(compareDistance);
    
      turf.featureEach(points, (pt, featureIndex) => {
        const distanceToPoint = turf.distance(targetPoint, pt);

        for (i =0 ; i<neighborArray.length; i++){
            if (distanceToPoint< neighborArray[i].properties.distanceToPoint) {
            let closest = turf.clone(points.features[featureIndex]);
            closest.properties.featureIndex = featureIndex;
            closest.properties.distanceToPoint = distanceToPoint;
            neighborArray.splice(i,0,closest);
            neighborArray =neighborArray.slice(0,neighborArray.length-1);
            break;
            } 
          }
      });
      return neighborArray;
    }

    function nearestPointMod(
      targetPoint,points) {
      // Input validation
      if (!targetPoint) throw new Error("targetPoint is required");
      if (!points) throw new Error("points is required");
        
      let nearest;
      let minDist = Infinity;
      let bestFeatureIndex = 0;
      
      turf.featureEach(points, (pt, featureIndex) => {
        const distanceToPoint = turf.distance(targetPoint, pt);
         
        if (distanceToPoint < minDist) {
          bestFeatureIndex = featureIndex;
          minDist = distanceToPoint;
        }
      });
      nearest = turf.clone(points.features[bestFeatureIndex]);
      nearest.properties.featureIndex = bestFeatureIndex;
      nearest.properties.distanceToPoint = minDist;
      return nearest;
    }


    exports.driversOnClientDestination = functions.database.ref('users/destinationPoint/{destinationId}/clients/{values}')
    .onCreate((snapshot, context) => {
      // Grab the current value of what was written to the Realtime Database.
      const original = snapshot.val();
      functions.logger.log('drivers on the path', context.params.destinationId, original);
      admin.database()
      .ref('/drivers/midPoints')
      .on('value', snapshot => {

        let driversMidPointsKey = Object.entries(snapshot.val());
        let altitudePoint = context.params.destinationId.split(',');
        altitudePoint = altitudePoint.map( elmnt =>  Number((elmnt.replace("+","."))));
        var targetPoint = turf.point(altitudePoint, {"marker-color": "#0F0"});

         let  pointNeighbors = driversMidPointsKey.map( pndt => {

          var pointes = turf.featureCollection( pndt[1].map( rslt => {
            let obj = turf.point(rslt);
            obj.driverID= pndt[0];
            return obj;
          }
          ));
          return nearestPointMod(targetPoint, pointes)
        })  
        pointNeighbors.map(lam =>  { 
          let db= JSON.stringify(lam.geometry.coordinates[0]).replace('.','+') +','+JSON.stringify(lam.geometry.coordinates[1]).replace('.','+');
            admin.database().ref('/users/destinationPoint/' +context.params.destinationId  + '/driverOnThePath').child(db).set(lam)
          }
        )
     })

     
    });





    exports.driversCloseToClientpickupPoint = functions.database.ref('users/pickupPoint/{pickupID}/clients/{pushID}') ///clients
    .onCreate((snapshot, context) => {
     const original = snapshot.val();
      functions.logger.log('neighbor drivers', context.params.pickupID, original);
       admin.database()
          .ref('/drivers/position')
          .on('value', snapshot => {
            let driversMidPointsKey = Object.entries(snapshot.val());
            
            let altitudePoint = context.params.pickupID.split(',');
            altitudePoint = altitudePoint.map( elmnt =>  Number((elmnt.replace("+","."))));
            var targetPoint = turf.point(altitudePoint, {"marker-color": "#0F0"});

             let pointsWithDriverID = turf.featureCollection( driversMidPointsKey.map (elmnt => {
              let altitudePoinet = elmnt[1].split(',');
                 let rsltFina =  altitudePoinet.map( elmnt =>  Number((elmnt.replace("+","."))));
                  console.log("here are the right and wrong.. ", rsltFina);
                let  obj= turf.point(rsltFina)
                obj.driverID = elmnt[0]
               return obj;
             }))
             return  admin.database().ref('/users/pickupPoint/' + context.params.pickupID + '/neighbor').set(neighborPointMod(targetPoint, pointsWithDriverID))
           
          })
    });


                                                                               
    exports.driversOntThePathCloseToClientpickupPoint = functions.database.ref('users/destinationPoint/{targetID}/driverOnThePath/{driverPositionID}')
    .onWrite((snapshot, context) => {
          admin.database().ref('/users/destinationPoint/' + context.params.targetID + '/driverOnThePath/').orderByChild('/users/destinationPoint/{targetID}/driverOnThePath/{driverPositionID}/properties/distanceToPoint')
          .limitToFirst(20)
          .on(
            'value', snapshot => {
       // admin.database().ref('/messingup').push(snapshot.val())

       //GET THE CLIENT POSITION....  /clients Object.values() => 
               /*let driversMidPointsKey = Object.entries(snapshot.val());
        let altitudePoint = context.params.destinationId.split(',');
        altitudePoint = altitudePoint.map( elmnt =>  Number((elmnt.replace("+","."))));
        var targetPoint = turf.point(altitudePoint, {"marker-color": "#0F0"});

         let  pointNeighbors = driversMidPointsKey.map( pndt => {

          var pointes = turf.featureCollection( pndt[1].map( rslt => {
            let obj = turf.point(rslt);
            obj.driverPositionID= pndt[0];
            return obj;
          }
          ));
          return nearestPointMod(targetPoint, pointes)
        })  
        pointNeighbors.map(lam =>  { 
          let db= JSON.stringify(lam.geometry.coordinates[0]).replace('.','+') +','+JSON.stringify(lam.geometry.coordinates[1]).replace('.','+');
            admin.database().ref('/users/destinationPoint/' + context.params.targetID  + '/driverOnThePath').child(lam.driverPositionID ).set(lam)
          }
        )*/


            }
          )
          

          
       
    });
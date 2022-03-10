const functions = require("firebase-functions");
// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
const turf = require('@turf/turf');
const geofire = require('geofire-common');
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

//beginning of functions not embedded.....

// Take the text parameter passed to this HTTP endpoint and insert it into 
// Firestore under the path /messages/:documentId/original
var globalVariable  = [];
exports.addMessage = functions.https.onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into Firestore using the Firebase Admin SDK.
  //const writeResult = await admin.database().ref('messages').add({original: original});
  let obj ={
    [original] : original
  }
  globalVariable.push(obj);

  // Send back a message that we've successfully written the message
  res.json({result:globalVariable}); // `Message with ID: ${writeResult.id} added.`
});


exports.ajouterText = functions.https.onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into Firestore using the Firebase Admin SDK.
  //const writeResult = await admin.database().ref('messages').add({original: original});
  let obj ={
    [original] : original + "ajouter "
  }
  globalVariable.push(obj);

  // Send back a message that we've successfully written the message
  res.json({result:globalVariable}); // `Message with ID: ${writeResult.id} added.`
});



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
      let arraySize = points.features.length<=20? points.features.length: 20;
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


    exports.driversOnClientDestination = functions.database.ref('users/destinationPoint/{destinationId}/clients/{values}/{pushID}')
    .onCreate( (snapshot, context) => {
    /*
    nombre de chauffeur C
    => pour chaque chauffeur .... on va entrer la position du chauffeur ...  
    =>Entrer les midpoints de chaque chauffeur => M * C 
    => M * O(1+C) => O(MC)
    pour chaque rider =>  R *  o(log(M + R)

    */
    // Add the hash and the lat/lng to the document. We will use the hash
    // for queries and the lat/lng for distance comparisons.
    //country => city => users => location 
    // country => city => drivers => midpoint (geohash, lat,lng,id : uid, role, places_vailable, place_Taken, )
    //country => city => drivers => location ... on time T.
    //matched_driver_rider
    // update 
    /*
    closest driver based on location..... 
      compare rider position to driver nearby and filter false positive...
    */

      // Grab the current value of what was written to the Realtime Database.
     // const original = snapshot.val();
     // functions.logger.log('drivers on the path', context.params.destinationId, original);
      admin.database()
      .ref('/drivers/midPoints')
      .on('value',async snapshot => {

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

        //choisir les chauffeurs allant dans la direction qui sont proches des utilisateurs.
         let AllFavouriteDriversPosition = await Promise.all( pointNeighbors.map( async lam =>  { 
          let db= JSON.stringify(lam.geometry.coordinates[0]).replace('.','+') +','+JSON.stringify(lam.geometry.coordinates[1]).replace('.','+');
            admin.database().ref('/users/destinationPoint/' +context.params.destinationId  + '/driverOnThePath').child(db).set(lam)
            
            const driversP = await admin.database().ref('/drivers/position/').child(lam.driverID).once('value')// orderByKey().equalTo(lam.driverID).once('value')
            driverPosition = driversP.val()
            driverPosition = driverPosition.split(",")
            driverPosition = driverPosition.map( elmnt =>  Number((elmnt.replace("+","."))))
            
            const placeAvail = await admin.database().ref('/drivers/availablePl/').child(lam.driverID).once('value')// orderByKey().equalTo(lam.driverID).once('value')
            let place  = placeAvail.val()
            let obj= {};
            obj.driverId = lam.driverID;
            obj.point = driverPosition;
            obj.place = place;
            return obj;
        })
      ) 
        let voisinageClient = context.params.values.split(',');
          voisinageClient = voisinageClient.map( elmnt =>  Number((elmnt.replace("+","."))));
     let voisinageClientDriverID = turf.featureCollection( AllFavouriteDriversPosition.map (elmnt => {
          let  obja= turf.point(elmnt.point)
          obja.driverID = elmnt.driverId
          obja.place = elmnt.place
         return obja;
       }))
       let chauffeurFavorable = neighborPointMod(voisinageClient,voisinageClientDriverID);
       let pickupPointVal = context.params.values;

       admin.database().ref('/users/favoTaxis/'+ context.params.destinationId).child (pickupPointVal).set(chauffeurFavorable);
        
     })

 //    return snapshot.ref.parent.parent.child('resultat/Proximite').set({tester:"voir... ce que je te dis depuis trop de familiarite engendre enormement de mepris"})
    });


/*exports.filterDriver = functions.database.ref('/requests/{destinationID}/{departureID}/{nbreOfPeople}/{uid}/')
.onCreate( async (snapshot, context) => {
  let clientID =  snapshot.val();
  let destination = context.params.destinationID;
  let departure = context.params.departureID;
  let nbreOfPeople = context.params.nbreOfPeople;
  let uid = context.params.uid;

  const favoritesDrivers = await admin.database().ref('/users/favoTaxis/' + destination).child(departure).once('value')// orderByKey().equalTo(lam.driverID).once('value')
  //functions.logger.log('favoritesDrivers favoritesDrivers favoritesDrivers favoritesDrivers favoritesDrivers favoritesDrivers',favoritesDrivers.val());

  let Drivers  = favoritesDrivers.val()
  let filteredDrivers = Drivers.map( driv => {
    if (driv.place >= parseInt(nbreOfPeople)) {
      let obj={};
      obj.destination = destination;
      obj.departure = departure;
      obj.driverID = driv.driverID;
      obj.nbreOfPeople = nbreOfPeople;
      obj.clientID = clientID;
      admin.database().ref('/drivers/alerting').child(driv.driverID).push(obj);
      return driv;
    }
  }).filter(Boolean);
  admin.database().ref('/users/potentialMatch/' + destination + '/' + departure).child(clientID).set(filteredDrivers);
 });*/


   /* exports.driversCloseToClientpickupPoint = functions.database.ref('users/pickupPoint/{pickupID}/clients/{pushID}') ///clients
    .onCreate((snapshot, context) => {
     //const original = snapshot.val();
     // functions.logger.log('neighbor drivers', context.params.pickupID, original);
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
    })*/
    function nearBy(coordinates,radius,url){
      const bounds = geofire.geohashQueryBounds(coordinates,radius);
      const promises =[] ;
     for ( const b of bounds ){
        const q = admin.database().ref(url) //('Cameroon/Douala/drivers/midPoints/ISK99cVxlsUWiJnSsj6z7AD7hts1')
        .orderByChild('geohash')
         .startAt(b[0])
        .endAt(b[1])
         promises.push(q.once('value'))
      }

     return Promise.all(promises).then(snapshots => {
        var matching = [];
        for (const snap of snapshots){
          for (const key in snap.val()){
             if(snap.val()){
              const lat = snap.val()[key].lat;
              const long = snap.val()[key].lng;
              const distanceInKm = geofire.distanceBetween([lat,long],coordinates);
              const distanceInM  = distanceInKm * 1000;
              if (distanceInM <= radius){
                if (!matching.includes(snap.val()[key].uid)) {
                  matching.push(snap.val()[key].uid);
                }
              }
            }
          } 

        }
        return matching;
      })
    }

    //exports.driverNearBy = functions.database.ref('Cameroon/{city}/rider/pickupPoint/{riderID}') 
    exports.driverNearBy = functions.database.ref('Cameroon/Douala/rider/{riderID}') //{city}
    .onCreate(async (snapshot, context) => {
      let  matchedDriver =[];
      let country = 'Cameroon';//context.params.country;
      let city = 'Douala';//context.params.city;
      let riderID = context.params.riderID;
      
      let rider = snapshot.val();
      const pickupCoordinates = [rider.pickup.lat,rider.pickup.lng];
      const destinationCoordinates = [rider.destination.lat,rider.destination.lng];

      let nearestDriver = await nearBy(pickupCoordinates,5000,`${country}/${city}/drivers/position`)

     // nearestDriver.map (async  driverID =>  await nearBy(destinationCoordinates,800,`${country}/${city}/drivers/midPoints/${driverID}`))
      //
      console.log("Here is the result ...",nearestDriver);
    });

import secrets from './secrets.json'
import axios from 'axios'
import { MongoClient } from 'mongodb'
// Initialize MongoDB connection
let client = new MongoClient(secrets.mongoConnectionString);
client.connect();
let db = client.db('radio');


axios.request({
    url: 'https://quuit.com/quu/mobile/qipplaylist',
    params: {
        stationid: 444,
        type: 'json'
    }
}).then((res) => {
    res.data.playlist.forEach((item: any) => {
        let readableDate = new Date(item.start).toUTCString();
        console.log(`${item.title} - ${item.artist}`)
        console.log(`${readableDate}\n`);
    });

    console.log(`Total: ${res.data.playlist.length} songs`);
})



// setInterval(() => {
//     console.log('Pulling playlist');
// }, 1000)
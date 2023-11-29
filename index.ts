import config from './config.json'
import axios from 'axios'
import { MongoClient } from 'mongodb'

// Initialize MongoDB connection
let client = new MongoClient(config.database.mongoConnectionString);
client.connect();
let db = client.db('jj').collection('kglk');


axios.request({
    url: 'https://quuit.com/quu/mobile/qipplaylist',
    params: {
        stationid: config.tracking.stationId,
        type: 'json'
    }
}).then((res) => {
    res.data.playlist.forEach(async (item: any) => {
        let readableDate = new Date(item.start).toUTCString();

        if (await db.findOne({ id: item.playlistid })) {
            return console.log(`Not adding ${item.title}`);
        } else {
            console.log(`Adding ${item.title} to database`);
            return await db.insertOne({
                id: item.playlistid,
                title: item.title,
                artist: item.artist,
                readableDate: readableDate
            });
        }

    });

    console.log(`Total: ${res.data.playlist.length} songs`);
})



// setInterval(() => {
//     console.log('Pulling playlist');
// }, 1000)
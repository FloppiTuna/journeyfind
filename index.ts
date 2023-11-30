import config from './config.json'
import axios from 'axios'
import { MongoClient } from 'mongodb'

// Initialize MongoDB connection
let client = new MongoClient(config.database.mongoConnectionString);
client.connect();
let db = client.db('jj').collection('kglk');

async function pullData() {
    axios.request({
        url: 'https://quuit.com/quu/mobile/qipplaylist',
        params: {
            stationid: config.tracking.stationId,
            type: 'json'
        }
    }).then(async (res) => {
        console.log(`Got ${res.data.playlist.length} songs`);

        await res.data.playlist.forEach(async (item: any) => {
            let readableDate = new Date(item.start).toUTCString();

            if (await db.findOne({ id: item.playlistid })) {
                // TODO: Song exists in MongoDB, but is this a new playtime?

                return console.log(`Skipping ${item.title} (${item.playlistid})`);
            } else {
                // Song doesn't exist in MongoDB, so add it along with this playtime
                console.log(`Adding ${item.title}`);
                return await db.insertOne({
                    id: item.playlistid,
                    title: item.title,
                    artist: item.artist,
                    playtimes: [ readableDate ]
                });
            }
        });
    });
}

await pullData();
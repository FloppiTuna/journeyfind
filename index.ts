import config from './config.json'
import axios from 'axios'
import { MongoClient } from 'mongodb'
import chalk from 'chalk';

let collection = config.database.useStationIdAsCollectionName ? config.tracking.stationId.toString() : config.tracking.callsign;

// Initialize MongoDB connection
let client = new MongoClient(config.database.mongoConnectionString);
client.connect();
let db = client.db('radio').collection(collection);

console.log(`
${chalk.greenBright('Galileo')}
${chalk.grey('---------------------')}
${chalk.grey('Station:')} ${config.tracking.stationId} (${config.tracking.callsign})
${chalk.grey('MongoDB Collection:')} ${collection}
`)


async function pullData() {
    axios.request({
        url: 'https://quuit.com/quu/mobile/qipplaylist',
        params: {
            stationid: config.tracking.stationId,
            type: 'json'
        }
    }).then(async (res) => {
        console.log(chalk.grey(`got ${res.data.playlist.length} songs back from quuit`));

        res.data.playlist.forEach(async (item: any) => {
            let readableDate = new Date(item.start).toUTCString();
            let dbEntry = await db.findOne({ id: item.playlistid });

            if (dbEntry) {
                // Song exists in MongoDB, but is this a new playtime?
                if (dbEntry.playtimes.includes(readableDate)) {
                    // We've seen this one before, skip it
                    return console.log(chalk.grey(`familiar playtime for "${item.title}" (${item.playlistid})`));
                } else {
                    // This is a brand new occourance, add it to the song's document
                    console.log(chalk.greenBright(`spotted "${item.title}" (${item.playlistid}): ${readableDate}`))
                    return db.updateOne(
                        { id: item.playlistid },
                        { $push: { playtimes: readableDate } },
                    )
                }

            } else {
                // Song doesn't exist in MongoDB, so add it along with this playtime
                console.log(chalk.yellowBright(`discovered "${item.title}" (${item.playlistid})`));
                return db.insertOne({
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

// Run every 10 minutes
setInterval(pullData, 600000);
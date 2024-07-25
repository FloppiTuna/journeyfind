import config from './config/config.json'
import axios from 'axios'
import { MongoClient } from 'mongodb'
import chalk from 'chalk';
import moment from 'moment';

// let collection = config.database.useStationIdAsCollectionName ? config.tracking.stationId.toString() : config.tracking.callsign;
// Initialize MongoDB connection
let client = new MongoClient(config.database.mongoConnectionString);
client.connect();
let db = client.db('radio');

let stations = config.tracking.stations;


console.log(`
${chalk.greenBright('Galileo')}
${chalk.grey('---------------------')}
${chalk.cyan('Configured stations:')}
`)

stations.forEach((station: any) => {
    console.log(`- ${chalk.greenBright(station.callsign)} (${chalk.yellowBright(`${station.provider}, ${station.id}`)})`);
});

console.log(`${chalk.italic(`Began tracking at ${moment().format(`YYYY-MM-DD HH:mm:ss a`)}`)}\n`);

async function pullData() {
    console.log(chalk.grey(`Pulling data - ${moment().format('YYYY-MM-DD HH:mm:ss a')}`));
    
    stations.forEach((station: any) => {
        let collection = db.collection(station.id.toString());
        console.log(`${chalk.greenBright(station.callsign)} (${chalk.yellowBright(`${station.provider}, ${station.id}`)})`);
        
        if (station.provider === 'cmg') {
            axios.request({
                url: `https://lsp-prod.cmg.com/api/v3/histories/${station.url}`,
                params: {
                    stationid: station.url,
                    type: 'json'
                }
            }).then(res => {
                res.data.forEach(async (event: any) => {
                    let readableDate = moment.utc(event.timestamp).format('YYYY-MM-DD HH:mm:ss a');
                    let dbEntry = await collection.findOne({ title: event.title, artist: event.artist });
                    
                    if (dbEntry) {
                        // Event exists in MongoDB, but is this a new playtime?
                        if (dbEntry.playtimes.includes(readableDate)) {
                            console.log(chalk.grey(`Ignoring ${event.category} "${event.title}": ${readableDate} has already been logged`));
                            return; // We've seen this one before, skip it
                        } else {
                            // This is a brand new occourance, add it to the song's document
                            console.log(chalk.greenBright(`Spotted ${event.category} "${event.title}": ${readableDate}`))
                            return collection.updateOne(
                                { title: event.title, artist: event.artist },
                                { $push: { playtimes: readableDate } },
                            )
                        }
                    } else {
                        console.log(chalk.yellowBright(`Discovered ${event.category} "${event.title}": ${readableDate}`));
                        return collection.insertOne({
                            title: event.title,
                            artist: event.artist,
                            artistMetadata: event.artists,
                            type: event.category,
                            rawType: event.categoryRaw, // This seems to always be "MUS" or "QQQ" (music or advertisement), but we'll keep it around just in case
                            playtimes: [ readableDate ]
                        });
                    }
                })
            })
        }
    });

    return;
}

await pullData();

// Run every 5 minutes
setInterval(pullData, 5 * 60 * 1000);
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
                res.data.forEach(async (song: any) => {
                    console.log(chalk.grey(`running over ${song.title} by ${song.artist}`));
                    let readableDate = moment.utc(song.timestamp).format('YYYY-MM-DD HH:mm:ss a');
                    let dbEntry = await collection.findOne({ id: song.id });
                    
                    if (dbEntry) {
                        // Song exists in MongoDB, but is this a new playtime?
                        if (dbEntry.playtimes.includes(readableDate)) {
                            console.log(chalk.grey(`Ignoring ${song.category}: "${song.title}" (${song.id}) because ${readableDate} has already been logged`));
                            return; // We've seen this one before, skip it
                        } else {
                            // This is a brand new occourence, add it to the song's document
                            console.log(chalk.blueBright(`Spotted ${song.category}: "${song.title}" (${song.id}) at ${readableDate}`))
                            return collection.updateOne(
                                { id: song.id },
                                { $push: { playtimes: readableDate } },
                            )
                        }
                    } else {
                        console.log(chalk.yellowBright(`Discovered ${song.category}: "${song.title}" (${song.id}) at ${readableDate}!`));
                        return collection.insertOne({
                            id: song.id,
                            title: song.title,
                            artist: song.artist,
                            artistMetadata: song.artists,
                            type: song.category,
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
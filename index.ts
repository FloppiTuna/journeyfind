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
        
        if (station.provider === 'quuit') {
            axios.request({
                url: 'https://quuit.com/quu/mobile/qipplaylist',
                params: {
                    stationid: station.id,
                    type: 'json'
                }
            }).then(res => {
                res.data.playlist.forEach(async (song: any) => {
                    let readableDate = moment.utc(song.start).format('YYYY-MM-DD HH:mm:ss a');
                    let dbEntry = await collection.findOne({ id: song.playlistid });
                    
                    if (dbEntry) {
                        // Song exists in MongoDB, but is this a new playtime?
                        if (dbEntry.playtimes.includes(readableDate)) {
                            return; // We've seen this one before, skip it
                        } else {
                            // This is a brand new occourence, add it to the song's document
                            console.log(chalk.blueBright(`Spotted "${song.title}" (${song.playlistid}) at ${readableDate}`))
                            return collection.updateOne(
                                { id: song.playlistid },
                                { $push: { playtimes: readableDate } },
                            )
                        }
                    } else {
                        console.log(chalk.yellowBright(`Found new song "${song.title}" (${song.playlistid}) at ${readableDate}!`));
                        return collection.insertOne({
                            id: song.playlistid,
                            title: song.title,
                            artist: song.artist,
                            playtimes: [ readableDate ]
                        });
                    }
                })
            })
        }
    });

    return;
    axios.request({
        url: 'https://quuit.com/quu/mobile/qipplaylist',
        params: {
            stationid: config.tracking.stationId,
            type: 'json'
        }
    }).then(async (res) => {
        res.data.playlist.forEach(async (item: any) => {
            let readableDate = moment.utc(item.start).format('YYYY-MM-DD HH:mm:ss a');
            let dbEntry = await db.findOne({ id: item.playlistid });

            if (dbEntry) {
                // Song exists in MongoDB, but is this a new playtime?
                if (dbEntry.playtimes.includes(readableDate)) {
                    // We've seen this one before, skip it
                    return console.log(chalk.grey(`familiar playtime for "${item.title}" (${item.playlistid}): ${readableDate}`));
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
                console.log(chalk.yellowBright(`discovered "${item.title}" (${item.playlistid}): ${readableDate}`));
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
setInterval(pullData, 900000);
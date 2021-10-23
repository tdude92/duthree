const Discord = require('discord.js');
const fs = require('fs');
const process = require('process');

const djsConfig = require('./config/djs_config.json');
const markovChainInitial = require('./markov_chains/markov_chain_initial.json');
var markovChain = require('./markov_chains/beemovie.json');
var channels = require('./config/channels.json');

const client = new Discord.Client();
const admins = djsConfig.adminID;
var currFileName  = djsConfig.defaultDataFile;  // Data used to train markov chain from scratch.
const recordedDataPath = './data/recorded_data.txt'; // Bot will record new data here for updating the chain.
var recordedDataStream = fs.createWriteStream(recordedDataPath);

// Utility functions
function sleep(ms) {
    // Used to avoid exceeding rate limits
    return new Promise(resolve => setTimeout(resolve, ms));
}

function writeJSON(path, obj) {
    fs.writeFileSync(path, JSON.stringify(obj), 'utf8');
}

function parseMsg(msg) {
    // Parses a Discord message string into an array of words with __START__ and __END__ tokens
    // ['__START__', 'hello', ',', 'world', '!', '__END__']
    let specialChars = '';//'!@#$%^&*(<)-=_+`~[]{}\\|;:",<.>/?—';
    let split = msg.trim().split(' ');
    let parsed = ['__START__'];
    for (chunk of split) {
        // Check if chunks have any special characters and separate them

        // Exceptions
        if (chunk[0] == '<' && '@#:' && chunk[chunk.length - 1] == '>' ||
            chunk == '@everyone' || chunk == '@here') {
            // Mentions, channels, emotes
            // @everyone, @here
            parsed.push(chunk);
            continue;
        }

        while (chunk.length > 0 && specialChars.includes(chunk[0])) {
            // Edge case: special char is first char
            parsed.push(chunk[0]);
            chunk = chunk.substring(1);
        }

        let slow = 0;
        for (fast = 1; fast < chunk.length; ++fast) {
            if (specialChars.includes(chunk[fast])) {
                parsed.push(chunk.substring(slow, fast)); // Split off word before special char
                parsed.push(chunk[fast]); // Push special char to parsed
                slow = ++fast;
            }
        }

        if (slow < chunk.length) parsed.push(chunk.substring(slow)); // Push last section to parsed
    }
    parsed.push('__END__');
    return parsed;
}

function markovChainAdd(prev, next) {
    // Update a connection between the words prev and next on the graph.
    if (!(prev in markovChain.graph && typeof markovChain.graph[prev] != 'function')) { // If the token is a function name like 'toString'
        // if markovChain.graph[prev] doesn't exist, create it                          // Then the key exists in the object as a function
        markovChain.graph[prev] = {'totalNext': 0, 'next': {}};
    }

    if (!(next in markovChain.graph[prev].next && typeof markovChain.graph[prev].next[next] != 'function')) {
        // if markovChain.graph[prev].next[next] doesn't exist, create it
        markovChain.graph[prev].next[next] = [1, null];
    } else {
        markovChain.graph[prev].next[next][0]++;
    }
    markovChain.graph[prev].totalNext++;
}

function updateMarkovChain(datapath) {
    // Update existing chain with new data
    // RETURNS: NUMBER OF MESSAGES IN recordedDataPath
    console.log(`Training Markov Chain using ${datapath}`);

    let data = fs.readFileSync(datapath);

    // Iterate through each token of each message and count the occurrences
    let lines = data.toString().trim().split('\n'); // Split data into lines
    for (line of lines) {
        let parsed = parseMsg(line);

        // Recompute average message lengths
        markovChain.avgMsgLength = (markovChain.avgMsgLength*markovChain.nMsgs + parsed.length)/++markovChain.nMsgs;

        for (i = 0; i < parsed.length - 1; ++i) {
            // Take subsequent pairs of words and update the markovChain object.
            try {
                markovChainAdd(parsed[i], parsed[i + 1]);
            } catch {
                console.log(parsed);
                console.log(parsed[i], parsed[i+1]);
                process.exit();
            }
        }
    }

    // Round average message length to a whole number
    markovChain.avgMsgLength = Math.round(markovChain.avgMsgLength);

    // Update the frequencies of each subsequent token for each token
    for (prev of Object.keys(markovChain.graph)) {
        let totalNext = markovChain.graph[prev].totalNext;
        for (next of Object.keys(markovChain.graph[prev].next)) {
            let nNext = markovChain.graph[prev].next[next][0];
            markovChain.graph[prev].next[next][1] = nNext / totalNext;
        }
    }
    
    writeJSON('./markov_chains/' + currFileName + '.json', markovChain);
    return lines.length;
}

function trainMarkovChain(datapath) {
    // Train Markov Chain from with a data text file
    markovChain = JSON.parse(JSON.stringify(markovChainInitial));
    updateMarkovChain(datapath); // ezclap
}

function markovGen() {
    // Generate a sequence of tokens until the __END__ token is generated.
    let out = ['__START__'];
    while (out[out.length - 1] != '__END__') {
        let currToken = out[out.length - 1];

        // Weighted random sample from currToken.next
        let next = markovChain.graph[currToken].next;
        let sum = 0, r = Math.random();
        for (token in next) {
            sum += next[token][1];

            // TODO: hacky fix for pings
            if (!token.includes('<@') && !token.includes('@everyone') && !token.includes('@here') && sum >= r) { // TODO: some total probabilities in the .next sum to 0.9999999 instead of 1
                out.push(token);
                break;
            }
        }
    }

    // Unparse-ify out
    out = out.slice(1, out.length - 1).join(' ');
    return out;
}


// Discord.js handlers
client.on('ready', () => {
    console.log('Ready to go!');
});

client.on('message', async message => {
    if (message.author.id != client.user.id) { // Only record/respond to messages not from the bot.
        // Record the message if it's in a channel that's being listened to
        if (channels.channels.includes(message.channel.id)) {
            for (line of message.content.trim().split('\n')) {
                recordedDataStream.write(line + '\n');
                console.log(`Recorded: ${line}`)
            }
        }
        
        // If the bot is atted, generate and send a message
        if (message.mentions.has(client.user.id) || message.content.toLowerCase().includes('duthree')) {
            message.channel.send(markovGen());
            console.log('Sent ' + message.author.username + ' generated message.');
        }

        // Fun stuff
        if (message.content.toLowerCase().includes('padoru')) {
            console.log('I\'ve padoru\'d');
            message.channel.send('PADORU!!');
        }
        if (message.content.includes('good bot')) {
            console.log('I\'ve been uwu\'d');
            message.channel.send('uwu');
        }
    }

    // Check if message is a command
    let parsedMsg = message.content.trim().split(' ');
    if (parsedMsg[0] == '>d3') {
        // Commands
        if (parsedMsg[1] == 'help') {
            message.channel.send('USER COMMANDS UWU:\n\npadoru: i padoru\ngood bot: i uwu\n>d3 who: i tell u which brain i\'m using.\n>d3 listData: Lists available data files\n>d3 setData [FILENAME].txt: Sets brain to the one trained on FILENAME');
        } else if (parsedMsg[1] == 'who') {
            message.channel.send(`I'm the one that learnt from ${currFileName} :)`);
        } else if (parsedMsg[1] == 'listData') {
            // Lists all data files that are available
            message.channel.send(`Available datasets:\n${fs.readdirSync('./data/').join('\n')}`);
        } else if (parsedMsg[1] == 'setData') {
            // Sets currFileName to the third token on the parsedMsg
            if (parsedMsg.length == 3 && parsedMsg[2].substring(parsedMsg[2].length - 4) == '.txt' &&
                fs.readdirSync('./data/').includes(parsedMsg[2])) {
                
                currFileName = parsedMsg[2].substring(0, parsedMsg[2].length - 4);

                // Load markov chain.
                // If it doesn't exist, train a new one from the data.
                if (!fs.readdirSync('./markov_chains/').includes(currFileName + '.json')) {
                    console.log('./markov_chains/' + currFileName + '.json not found.');
                    trainMarkovChain('./data/' + currFileName + '.txt');
                    console.log('test');
                }
                markovChain = require('./markov_chains/' + currFileName + '.json');
                console.log('Swapped Markov Chain to ' + currFileName + '.json');
                message.channel.send('Swapped Markov Chain to ' + currFileName + '.json');
            } else {
                message.channel.send('U did smth wrong.\nUsage: >d3 setData [FILENAME].txt');
            }
        }

        if (admins.includes(message.author.id)) {
            // Admin command
            if (parsedMsg[1] == 'updateMarkov') {
                // Update brain
                let nMsgs = updateMarkovChain(recordedDataPath);
                recordedDataStream = fs.createWriteStream(recordedDataPath);
                console.log(`Updated Markov Chain with ${nMsgs} new messages.`)
                message.channel.send(`Studied ${nMsgs} new messages!`);
            } else if (parsedMsg[1] == 'resetMarkov') {
                // Train a new brain
                trainMarkovChain('./data/' + currFileName + '.txt');
                console.log(`Trained Markov Chain with data from ./data/${currFileName}`);
                message.channel.send(`Reset ${currFileName}.json with data from ${currFileName}.txt.`);
            } else if (parsedMsg[1] == 'listen') {
                // Listen to text channel
                if (!channels.channels.includes(message.channel.id)) {
                    channels.channels.push(message.channel.id);
                    writeJSON('./config/channels.json', channels);
                    console.log(`Added #${message.channel.name} in ${message.guild.name} to listen list.`);
                    message.channel.send('yos');
                } else {
                    message.channel.send('It\'s already there..');
                }
            } else if (parsedMsg[1] == 'unlisten') {
                // Stop listening to text channel
                channels.channels.splice(channels.channels.indexOf(message.channel.id), 1);
                writeJSON('./config/channels.json', channels);
                console.log(`Removed #${message.channel.name} in ${message.guild.name} from listen list.`)
                message.channel.send('yis');
            } else if (parsedMsg[1] == 'yoink') {
                // Yoink data from message channel
                message.channel.send('oki');
                let dataStream = fs.createWriteStream(`./data/${message.channel.name}.txt`);
                let nMsgs = 0;
                let lastMsgID;
                let messages;
        
                while (true) {
                    if (lastMsgID) {
                        messages = await message.channel.messages.fetch({
                            limit: 100,
                            before: lastMsgID
                        });
                    } else {
                        messages = await message.channel.messages.fetch({
                            limit: 100
                        });
                    }
        
                    if (messages.size == 0) {break;}
        
                    // Write messages
                    messages.each(m => {
                        let parsedM = m.content.split('\n');
                        parsedM.forEach(line => {
                            line = line.trim();
                            // Filter rubbish data
                            if (!(line.includes('http://') || line.includes('https://') || line.includes('@everyone') ||
                                  line.includes('@here')   || line == ''                || botID.includes(m.author.id))) {
                                dataStream.write(line + "\n");
                                console.log(`Scraped ${++nMsgs} from #${message.channel.name} in '${message.guild.name}'`);
                            }
                        });
                    });
        
                    lastMsgID = messages.last().id;
                    await sleep(1000);
                }
        
                console.log(`yoinked ${nMsgs} messages :)`);
                message.channel.send(`i have successfully yoinked`);
            } else if (parsedMsg[1] == 'adminhelp') {
                message.channel.send('ADMIN COMMANDS:\n>d3 resetMarkov: Reset currently loaded Markov Chain\n>d3 updateMarkov: Update Markov Chain and flush recorded_data.txt\n>d3 listen: Start listening to a channel\n>d3 unlisten: Stop listening to a channel\n>d3 yoink: Scrape data from a channel');
            }
        }
    }
});

// Initialize Discord.js client
client.login(djsConfig.botToken);

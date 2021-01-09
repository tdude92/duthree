import json

config = {}

# Get admin tokens
print("Admins of this bot will have access to the bot's admin commands, which are able to modify the computer that duthree is hosted on.")
config["adminID"] = input("Input a space separated list of the user ids of all admins: ").strip().split()
print()

# Get bot token
config["botToken"] = input("Input Discord Bot Token: ").strip()
print()

config["defaultDataFile"] = "beemovie"
print("Default data file for the Markov Chain has been set to beemovie.txt")
print("You can change the defaultDataFile element in ./config/djs_config.json to any text file of your liking.")

with open("./config/djs_config.json", "w") as wf:
    wf.write(json.dumps(config, indent = 4))
# PumpFun_bundle

Pumpfun multi-wallet bundle transaction based on Solana blockchain, supporting token creation, bundled buying and selling, and address table optimization methods.

## Features

- 🪙 Token creation: support custom token names, symbols and images

- 💰 Bundled transactions: support 21 wallet bundled buying and selling operations

- 📊 Address optimization: integrated address lookup table (ALT) to reduce transaction fees

- ⚡ MEV protection: integrated Jito MEV-Boost to improve transaction success rate

- 🔄 Automation: fully automated transaction process

- 🛡️ Slippage protection: built-in slippage protection mechanism

## Project structure

```
PumpFun_bundle/
├── src/ # Source code directory
│ ├── sdk/ # SDK core implementation
│ │ └── pumpFunSDK.js # SDK implementation of Pump Fun protocol
│ ├── utils/ # Tool function
│ │ └── addressLookupTable.js # Address lookup table tool
│ ├── scripts/ # Execute script
│ │ ├── tokenCreateAndBuy.js # Create and buy tokens
│ │ ├── tokenSell.js # Sell tokens
│ │ └── addressTableManager.js # Address table management
│ └── IDL/ # Interface definition
│ ├── pumpFunProtocol.json # Protocol interface definition
│ └── protocolExport.js # Export interface
└── config/ # Configuration file directory
├── img/ # Token image directory
├── walletKeys.txt # Wallet private key file
└── lookupTable.txt # Address lookup table configuration
```

## Installation instructions

1. Clone the project
```
git clone https://github.com/your-repo/PumpFun_bundle.git
```

2. Install dependencies
```
npm install
```

3. Configure wallet private key and address lookup table
```
Create configuration directory
mkdir -p config/img
Add private key file
touch config/walletKeys.txt
Add token image
cp your_token_image.png config/img/
```

## Instructions

1. Create and buy tokens
```
node src/scripts/tokenCreateAndBuy.js
```

2. Sell tokens
```
node src/scripts/tokenSell.js
```

3. Address table management
```
node src/scripts/addressTableManager.js
```

## Configuration instructions

1. Wallet private key: config/walletKeys.txt
```
[Wallet 1 private key]
…………………………
[Wallet 20 private key]
```

2. Token image
- Put the token image in the `config/img/` directory
- Support jpg, jpeg, png, gif formats

3. RPC configuration
- Set the RPC node address in the script
- It is recommended to use a private RPC node to improve performance

## Notes

- ⚠️ Please keep the private key file properly
- 🔒 It is recommended to use an independent trading wallet
- 💡 It is recommended to use a private RPC node
- 📊 Pay attention to the slippage setting to control risks

## Technical support
- If you encounter any problems, please submit an Issue
- Welcome to submit a Pull Request to improve the code
- Communication group: [Buff Community](https://t.me/chainbuff)

## Disclaimer

This project is for learning and research only. Any losses caused by using this project have nothing to do with the author. Before using this project, please make sure you have fully understood the relevant risks.

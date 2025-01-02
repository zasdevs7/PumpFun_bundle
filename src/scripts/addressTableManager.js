const { Connection, Keypair, PublicKey, Transaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const { getCurrentSlot, createAddressLookupTable, extendAddressLookupTable, closeAddressLookupTable, deactivateAddressLookupTable } = require("../utils/addressLookupTable");
const fs = require('fs').promises;
// RPC 连接
const RPC_URL = "rpc搞里头";
const connection = new Connection(RPC_URL, "confirmed");

// 钱包私钥和公钥
const walletKeypair = "私钥搞里头"; // 设置钱包的私钥（dev私钥）
const wallet = Keypair.fromSecretKey(bs58.decode(walletKeypair));

// 获取bs58私钥
async function getPublicKeysFromFile() {
    try {
        const fileContent = await fs.readFile("../config/walletKeys.txt", 'utf8');
        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const publicKeys = [];

        for (const line of lines) {
            try {
                const privateKey = bs58.decode(line);
                const keypair = Keypair.fromSecretKey(privateKey);
                publicKeys.push(keypair.publicKey);
            } catch (error) {
                console.error(`无法处理私钥: ${line}`, error);
            }
        }

        return publicKeys;
    } catch (error) {
        console.error("读取文件失败:", error);
        return [];
    }
}

async function main() {

    const lookupTableAddress = new PublicKey('6wiXsHxr4A8jrMJjCmKXg1zN4yfiNH4wNFqnjjZHPt5e');

    // 停用地址查表地址
    // rpc连接实例 钱包密对 地址查表地址需要PublicKey
    const deactivate = await deactivateAddressLookupTable(connection, wallet, lookupTableAddress);
    console.log(deactivate);

    // 关闭地址查表地址, 退租金，这里需要先停用，等交易上链后，还需要等待4分钟才能关闭
    // 参数 rpc连接实例 钱包密对 地址查表地址需要PublicKey
    // const close = await closeAddressLookupTable(connection, wallet, lookupTableAddress);
    // console.log(close);

}

main();
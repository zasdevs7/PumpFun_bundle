const { PublicKey, Connection, Keypair, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram, SystemProgram, VersionedTransaction, TransactionMessage } = require("@solana/web3.js");
const axios = require("axios");
const fs = require('fs').promises;
const { NATIVE_MINT, getAssociatedTokenAddress } = require('@solana/spl-token');
const { PumpFunSDK } = require("../sdk/pumpFunSDK");
const { AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const bs58 = require("bs58");

const walletSecret = "私钥搞里头"; // 设置钱包的私钥（dev私钥）

const wallet = Keypair.fromSecretKey(new Uint8Array(bs58.decode(walletSecret)));

const connection = new Connection("rpc搞里头", "confirmed");

const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

const sdk = new PumpFunSDK(provider);

// 读取walletKeys.txt中的私钥
async function getPublicKeysFromFile(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const wallets = [];

        for (const line of lines) {
            try {
                const privateKey = bs58.decode(line);
                const keypair = Keypair.fromSecretKey(privateKey);
                wallets.push(keypair);
            } catch (error) {
                console.error(`无法处理私钥: ${line}`, error);
            }
        }

        return wallets;
    } catch (error) {
        console.error("读取文件失败:", error);
        return [];
    }
}

async function readAddressesFromFile(filePath) {
    try {
        
        const data = await fs.readFile(filePath, 'utf8');
        
        const addresses = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        const lastAddress = addresses[addresses.length - 1];
        const lastPublicKey = new PublicKey(lastAddress);

        return lastPublicKey;
    } catch (error) {
        console.error('读取文件出错:', error);
        return [];
    }
}

function chunkArray(arr, chunkSize) {
    const result = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        result.push(arr.slice(i, i + chunkSize));
    }
    return result;
}

const init = async () => {
    // ca地址
    const mintPublicKey = "3Y7gjzcR2iPeFiZanUrwS6gWocVJzTCkWeMgYbarpump";
    const mint = new PublicKey(mintPublicKey);
    
    // 默认地址查表地址，不可去掉
    const defaultLookupPublicKey = "8GG7J73ZUgTiv8SKBjqCjQbiaJXZKuNbjm1uhK3p3Zim";
    const defaultLookup = new PublicKey(defaultLookupPublicKey);

    const SLIPPAGE_BASIS_POINTS = 500n;
    
    const walletNames = await getPublicKeysFromFile("../config/walletKeys.txt");
    console.log("老鼠仓钱包数量: ", walletNames.length);
    
    const walletChunks = chunkArray(walletNames, 5);
    

    // 获取保存的地址查表地址
    const lookupTableAddress = await readAddressesFromFile('../config/lookupTable.txt');
    console.log("当前使用自定义地址查表地址: ", lookupTableAddress.toBase58());
    
    const defaultLookupTableAccounts = (await connection.getAddressLookupTable(defaultLookup)).value;
    if (!defaultLookupTableAccounts) {
        console.log("没有找到有效的默认查找表账户，停止操作。");
        return;
    }
    
    const addressesFromDefaultLookupTable = defaultLookupTableAccounts.state.addresses;
    if (addressesFromDefaultLookupTable.length === 0) {
        console.log("默认查找表中没有有效的地址，停止操作。");
        return;
    }
    
    const customLookupTableAccounts = (await connection.getAddressLookupTable(lookupTableAddress)).value;
    if (!customLookupTableAccounts) {
        console.log("没有找到有效的自定义查找表账户，停止操作。");
        return;
    }
    
    const addressesFromCustomLookupTable = customLookupTableAccounts.state.addresses;
    if (addressesFromCustomLookupTable.length === 0) {
        console.log("自定义查找表中没有有效的地址，停止操作。");
        return;
    }

    let allTransactions = [];
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    console.log("获取区块哈希:", latestBlockhash.blockhash);

    for (let chunkIndex = 0; chunkIndex < walletChunks.length; chunkIndex++) {
        const chunk = walletChunks[chunkIndex];
        let chunkTx = new Transaction();
        
        for (let i = 0; i < chunk.length; i++) {
            const keypair = chunk[i];
            
        ///////////////// 动态滑点修改: 添加动态滑点计算 /////////////////
        // 计算动态滑点 - 越后面卖出的滑点越大
        const dynamicSlippage = calculateDynamicSlippage(chunkIndex, i, walletChunks.length);
        ///////////////////////////////////////////////////////////////////////////
            
            // 查询代币余额
            const tokenAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
            const tokenBalInfo = await connection.getTokenAccountBalance(tokenAta);
            const tokenBalance = BigInt(tokenBalInfo.value.amount);
            
            const instruction = await sdk.getSellInstructionsByTokenAmount(
                keypair.publicKey,
                mint,
                tokenBalance,
                dynamicSlippage,  // 使用动态滑点
                'confirmed'
            );
            
            chunkTx.add(instruction);
        }

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0.00001 * LAMPORTS_PER_SOL });
        chunkTx.add(modifyComputeUnits, addPriorityFee);  // 添加优先费用指令

        const message = new TransactionMessage({
            payerKey: chunk[0].publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: chunkTx.instructions,
        }).compileToV0Message([customLookupTableAccounts, defaultLookupTableAccounts]);

        const transactionV0 = new VersionedTransaction(message);
        const serializedMsg = transactionV0.serialize();
        console.log("交易大小:", serializedMsg.length);

        if (serializedMsg.length > 1232) {
            console.log("交易过大");
        }
        // 签名v0交易
        transactionV0.sign([...chunk]);

        allTransactions.push(transactionV0);
    }


    let jitoTx = new Transaction();

    const jitoTipAccounts = [
        "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
        "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
        "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
        "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
        "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
        "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
        "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
        "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    ];
    const randomIndex = Math.floor(Math.random() * jitoTipAccounts.length);
    const randomJitoTipAccount = jitoTipAccounts[randomIndex];

    console.log("随机选择的小费钱包地址:", randomJitoTipAccount);
    const transferInstruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey, // 钱包地址
        toPubkey: new PublicKey(randomJitoTipAccount), // 小费钱包地址
        lamports: 0.0001 * LAMPORTS_PER_SOL, // 给小费的金额
    });

    jitoTx.add(transferInstruction);

    const messageJito = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: jitoTx.instructions,
    }).compileToV0Message();

    const transactionJito = new VersionedTransaction(messageJito);


    // 签名v0交易
    transactionJito.sign([wallet]);

    const base58JitoFeeTx = bs58.encode(transactionJito.signatures[0])
    const base58Transaction = bs58.encode(transactionJito.serialize())
    const jitoTransactions = [base58Transaction]
    for (let i = 0; i < allTransactions.length; i++) {
        const serializedTransaction = bs58.encode(allTransactions[i].serialize())
        jitoTransactions.push(serializedTransaction)
    }

    console.log("完成创建的交易批次开始提交到Jito:", allTransactions.length);


    try {
        const url = "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles"
        const data = {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [jitoTransactions]
        };
        const headers = {
            'Content-Type': 'application/json'
        }

        const startTime = Date.now();
        const jito = await axios.post(url, data, { headers });

        const endTime = Date.now();

        const timeTaken = endTime - startTime;

        console.log("提交成功:", jito.data);
        const confirmation = await connection.confirmTransaction({
            signature: base58JitoFeeTx,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
        });
        console.log("交易确认:", confirmation);
        console.log(`请求耗时：${timeTaken} 毫秒`);
    } catch (error) {
        if (error.response) {

            console.error('错误响应:', error.response.data);

            if (error.response.data.error) {
                console.error('错误代码:', error.response.data.error.code);
                console.error('错误信息:', error.response.data.error.message);
                console.error('错误详情:', error.response.data.error.details);
            }
        } else if (error.request) {

            console.error('请求已发出，但没有收到响应:', error.request);
        }
    }


};

///////////////// 动态滑点修改: 更新滑点百分比 /////////////////
function calculateDynamicSlippage(chunkIndex, positionInChunk, totalChunks) {
    // 基础滑点 1000%
    const baseSlippage = 10000n;
    // 每批次增加 100% 的滑点
    const chunkSlippage = BigInt(chunkIndex * 1000);
    // 每个位置增加 50% 的滑点
    const positionSlippage = BigInt(positionInChunk * 500);
    
    return baseSlippage + chunkSlippage + positionSlippage;
}
///////////////////////////////////////////////////////////////////////////

init();
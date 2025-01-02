const { PublicKey, Connection, Keypair, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram, SystemProgram, VersionedTransaction, TransactionMessage } = require("@solana/web3.js");
const base64js = require('base64-js');
const axios = require("axios");
const fs = require('fs').promises;
const fileSystem = require('fs');
const { getCurrentSlot, createAddressLookupTable, extendAddressLookupTable } = require("../utils/addressLookupTable");
const { PumpFunSDK } = require("../sdk/pumpFunSDK");
const { AnchorProvider } = require("@coral-xyz/anchor");
const bs58 = require("bs58");

const walletSecret = "dev私钥搞里头"; // 设置钱包的私钥（dev私钥）
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

function chunkArray(arr, chunkSize) {
    const result = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        result.push(arr.slice(i, i + chunkSize));
    }
    return result;
}

function getRandomInRange(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function uploadImage() {
    try {
        const files = await fileSystem.promises.readdir("../config/img");
        console.log("文件夹中的文件：", files);
        const imageFiles = files.filter(file =>
            file.match(/\.(jpg|jpeg|png|gif)$/i)
        );

        if (imageFiles.length === 0) {
            console.log("在 img 文件夹中没有找到���效的图片文件");
            return;
        }

        if (imageFiles.length > 1) {
            console.log("在 img 文件夹中找到多个图片，请只保留一张图片");
            return;
        }
        const imageStream = fileSystem.createReadStream(`../config/img/${imageFiles[0]}`);

        console.log("正在上传图片：", imageFiles[0]);
        //代币元数据
        const createData = {
            file: imageStream,
            name: "mrhuang xiuxiu",
            symbol: "mrhuang",
            description: "mrhuang-bot",
            twitter: "https://x.com/soul55666",
            telegram: "https://x.com/soul55666",
            website: "https://x.com/soul55666",
        };

        return createData;
    } catch (err) {
        console.error("读取文件夹时发生错误:", err);
    }
}

const init = async () => {
    // ca私钥
    const mintPublicKey = "2EnUVrz5NWYGni5W3PMZxLi9igvZ2SSQhtyvBG8TD5bfLSNaxFhgzEQFBUQDNXJpQ289yexKS8yKsyBAJvyjgSC6";
    const mint = Keypair.fromSecretKey(new Uint8Array(bs58.decode(mintPublicKey)));

    // 默认地址查表地址，不可去掉
    const defaultLookupPublicKey = "8GG7J73ZUgTiv8SKBjqCjQbiaJXZKuNbjm1uhK3p3Zim";
    const defaultLookup = new PublicKey(defaultLookupPublicKey);

    const SLIPPAGE_BASIS_POINTS = 500n;

    const buyAmountSol = BigInt(0.0001 * LAMPORTS_PER_SOL);

    const walletNames = await getPublicKeysFromFile("../config/walletKeys.txt");
    console.log("老鼠仓钱包数量: ", walletNames.length);

    const walletChunks = chunkArray(walletNames, 5);
    console.log("已创建私钥批次:", walletChunks.length);

    const { lookupTableAddress, signature } = await createAddressLookupTable(connection, wallet);
    console.log("地址查表地址", lookupTableAddress.toBase58());
    console.log("交易签名", signature);

    // 提取钱包公钥添加到地址查表地址中
    const walletPublicKeys = walletNames.map(wallet => {
        if (wallet.publicKey) {
            return new PublicKey(wallet.publicKey);
        } else {
            throw new Error(`钱包缺少公钥字段: ${JSON.stringify(wallet)}`);
        }
    });

    // // 添加地址到地址查表
    const extend = await extendAddressLookupTable(connection, wallet, lookupTableAddress, walletPublicKeys);
    console.log("交易签名", extend);

    // 获取默认查找表账户
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

    const metaImage = await uploadImage();
    if (!metaImage) {
        console.log("没有找到有效的图片文件");
        return;
    }

    let allTransactions = [];
    let jitoTx = new Transaction();

    // 获取区块哈希
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    console.log("获取区块哈希:", latestBlockhash.blockhash);

    const metadata = await sdk.createAndBuy(wallet, mint, metaImage, buyAmountSol, SLIPPAGE_BASIS_POINTS, 'confirmed');
    
    jitoTx.add(metadata);

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
        fromPubkey: wallet.publicKey,                   // 钱包地址
        toPubkey: new PublicKey(randomJitoTipAccount),  // 小费钱包地址
        lamports: 0.0001 * LAMPORTS_PER_SOL,            // 给小费的金额
    });

    jitoTx.add(transferInstruction);

    const messageJito = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: jitoTx.instructions,
    }).compileToV0Message();

    const transactionJito = new VersionedTransaction(messageJito);

    // 签名v0交易
    transactionJito.sign([wallet, mint]);
    
    for (let chunkIndex = 0; chunkIndex < walletChunks.length; chunkIndex++) {
        const chunk = walletChunks[chunkIndex];
        console.log("处理第", chunkIndex + 1, "批钱包");
        let chunkTx = new Transaction();
        for (let i = 0; i < chunk.length; i++) {

            const keypair = chunk[i];
            // 随机一个 10 到 25 之间的百分比
            const randomPercent = getRandomInRange(10, 25);

            //（例如：买入金额 ± 随机百分比）
            const buyAmountSolWithRandom = buyAmountSol / BigInt(100) * BigInt(randomPercent % 2 ? (100 + randomPercent) : (100 - randomPercent));

            console.log(buyAmountSolWithRandom);
            
            const instruction = await sdk.getBuyInstructionsBySolAmount(
                keypair.publicKey,                        // 购买者的地址
                mint.publicKey,                           // 目标代币的mint地址
                buyAmountSolWithRandom,                   // 购买所需的SOL数量
                SLIPPAGE_BASIS_POINTS,                    // 允许的最大滑点为 5%
                'confirmed'                               // 确认级别为 confirmed
            );
            
            instruction.instructions.forEach((instruction) => {

                chunkTx.add(instruction);
            });


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

init();
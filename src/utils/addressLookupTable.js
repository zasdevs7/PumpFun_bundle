const { Transaction, sendAndConfirmTransaction, AddressLookupTableProgram } = require("@solana/web3.js");
const fs = require('fs');

// 保存地址到 lookupTable.txt
function saveAddressToFile(address) {
    const filePath = '../config/lookupTable.txt';
    fs.appendFile(filePath, address + '\n', (err) => {
        if (err) {
            console.error("保存地址到 lookupTable.txt 失败:", err);
        } else {
            console.log(`地址已保存到 lookupTable.txt: ${address}`);
        }
    });
}

// 获取当前的 slot
async function getCurrentSlot(connection) {
    const slot = await connection.getSlot();
    console.log("当前 Slot:", slot);
    return slot;
}

// 创建地址查找表的功能
async function createAddressLookupTable(connection, wallet) {
    try {
        const slot = await getCurrentSlot(connection);
        const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            recentSlot: slot,
        });

        console.log("查找表地址:", lookupTableAddress.toBase58()); 
        const transaction = new Transaction().add(lookupTableInst); 
        const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
        console.log("交易已签名并发送，签名:", signature);
        // 等待交易确认
        await connection.confirmTransaction(signature);

        console.log("交易已确认");

        // 保存查找表地址到文件
        saveAddressToFile(lookupTableAddress.toBase58());
        return { lookupTableAddress, signature };
    } catch (error) {
        console.error("创建地址查找表失败:", error);
        return null;
    }
}

// 向查找���添加地址
async function extendAddressLookupTable(connection, wallet, lookupTableAddress, publicKeys) { 
    const extendLookupTableInst = AddressLookupTableProgram.extendLookupTable({
        authority: wallet.publicKey, 
        payer: wallet.publicKey, 
        lookupTable: lookupTableAddress, 
        addresses: publicKeys, 
    }); 
    const transaction = new Transaction().add(extendLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);

    console.log("交易已签名并发送，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
        console.error("交易确认失败，错误信息:", confirmation.value.err);
        return null;
    }
    console.log("交易已确认");
    return signature;
}

// 关闭地址查表地址
async function closeAddressLookupTable(connection, wallet, lookupTableAddress) { 
    const closeLookupTableInst = AddressLookupTableProgram.closeLookupTable({
        authority: wallet.publicKey, 
        lookupTable: lookupTableAddress, 
        recipient: wallet.publicKey, 
    }); 
    const transaction = new Transaction().add(closeLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);

    console.log("交易已签名并发送，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
        console.error("交易确认失败，错误信息:", confirmation.value.err);
        return null;
    }
    console.log("交易已确认");
    return signature;
}

// 停用地址查表地址
async function deactivateAddressLookupTable(connection, wallet, lookupTableAddress) {
    
    const deactivateLookupTableInst = AddressLookupTableProgram.deactivateLookupTable({
        authority: wallet.publicKey, 
        lookupTable: lookupTableAddress, 
    }); 
    const transaction = new Transaction().add(deactivateLookupTableInst); 
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);

    console.log("交易已签名并发送，签名:", signature); 
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
        console.error("交易确认失败，错误信息:", confirmation.value.err);
        return null;
    }
    console.log("交易已确认");
    return signature;

}

module.exports = {
    getCurrentSlot,
    createAddressLookupTable,
    extendAddressLookupTable,
    closeAddressLookupTable,
    deactivateAddressLookupTable,
};
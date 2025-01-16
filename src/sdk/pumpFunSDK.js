const { LAMPORTS_PER_SOL, ComputeBudgetProgram, PublicKey, SendTransactionError, Transaction, TransactionMessage, VersionedTransaction } = require("@solana/web3.js");
const { struct, bool, u64, publicKey } = require("@coral-xyz/borsh");
const { Program } = require("@coral-xyz/anchor");
const { createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddress } = require("@solana/spl-token");
const BN = require("bn.js");
const IDL = require("../IDL/pumpFunProtocol.json");
const axios = require('axios');
const FormData = require('form-data');

const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

const GLOBAL_ACCOUNT_SEED = "global";
const MINT_AUTHORITY_SEED = "mint-authority";
const BONDING_CURVE_SEED = "bonding-curve";
const METADATA_SEED = "metadata";

const DEFAULT_DECIMALS = 6;

class PumpFunSDK {
  constructor(provider) {
    this.program = new Program(IDL, provider); // 使用 Anchor 库初始化程序
    this.connection = this.program.provider.connection;
  }
  // 创建并购买操作
  async createAndBuy(creator, mint, createTokenMetadata, buyAmountSol, slippageBasisPoints = 500n, commitment = DEFAULT_COMMITMENT) {
    let tokenMetadata = await this.createTokenMetadata(createTokenMetadata);
    
    let createTx = await this.getCreateInstructions(
      creator.publicKey,
      createTokenMetadata.name,
      createTokenMetadata.symbol,
      tokenMetadata.metadataUri,
      mint
    );
    let newTx = new Transaction().add(createTx);

    if (buyAmountSol > 0) {
      const globalAccount = await this.getGlobalAccount(commitment); 
      const buyAmount = globalAccount.getInitialBuyPrice(buyAmountSol); 
      const buyAmountWithSlippage = calculateWithSlippageBuy(buyAmountSol, slippageBasisPoints); 
      const buyTx = await this.getBuyInstructions(
        creator.publicKey,
        mint.publicKey,
        globalAccount.feeRecipient,
        buyAmount,
        buyAmountWithSlippage
      );
      newTx.add(buyTx);
    }
    return newTx;
  }
  //创建代币指令
  async getCreateInstructions(creator, name, symbol, uri, mint) {
    const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID); // 获取MPL代币元数据程序的公共密钥

    const [metadataPDA] = PublicKey.findProgramAddressSync([Buffer.from(METADATA_SEED), mplTokenMetadata.toBuffer(), mint.publicKey.toBuffer()], mplTokenMetadata);

    const associatedBondingCurve = await getAssociatedTokenAddress(mint.publicKey, this.getBondingCurvePDA(mint.publicKey), true);

    return this.program.methods
      .create(name, symbol, uri)
      .accounts({
        mint: mint.publicKey,
        associatedBondingCurve: associatedBondingCurve,
        metadata: metadataPDA,
        user: creator,
      })
      .signers([mint])
      .transaction();
  }
///////////////// 动态滑点修改: 买入时影响代币数量 /////////////////
async getBuyInstructionsBySolAmount(buyer, mint, buyAmountSol, slippageBasisPoints = 500n, commitment = DEFAULT_COMMITMENT) {
  const globalAccount = await this.getGlobalAccount(commitment);
  // 计算预期获得的代币数量
  const expectedTokenAmount = globalAccount.getInitialBuyPrice(buyAmountSol);
  
  // 计算考虑滑点后的最小代币数量
  let minTokenAmount = calculateTokenSlippage(expectedTokenAmount, slippageBasisPoints);
  
  return await this.getBuyInstructions(
      buyer,
      mint,
      globalAccount.feeRecipient,
      minTokenAmount,  // 使用计算后的最小代币数量
      buyAmountSol
  );
}
///////////////////////////////////////////////////////////////////////////


  // 获取购买指令
  async getBuyInstructions(buyer, mint, feeRecipient, amount, solAmount, commitment = DEFAULT_COMMITMENT) {
    const associatedBondingCurve = await getAssociatedTokenAddress(mint, this.getBondingCurvePDA(mint), true);

    const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);

    let transaction = new Transaction();

    try {
      await getAccount(this.connection, associatedUser, commitment);
    } catch (e) {
      transaction.add(createAssociatedTokenAccountInstruction(buyer, associatedUser, buyer, mint));
    }

    transaction.add(
      await this.program.methods
        .buy(new BN(amount.toString()), new BN(solAmount.toString()))
        .accounts({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: associatedUser,
          user: buyer,
        })
        .transaction(),
    );

    return transaction;
  }

  // 获取出售指令
  async getSellInstructionsByTokenAmount(seller, mint, sellTokenAmount, slippageBasisPoints = 500n, commitment = DEFAULT_COMMITMENT) {
    let bondingCurveAccount = await this.getBondingCurveAccount(mint, commitment);
    if (!bondingCurveAccount) {
      throw new Error(`未找到绑定曲线账户: ${mint.toBase58()}`);
    }

    let globalAccount = await this.getGlobalAccount(commitment);

    let minSolOutput = bondingCurveAccount.getSellPrice(sellTokenAmount, globalAccount.feeBasisPoints);

    let sellAmountWithSlippage = calculateWithSlippageSell(minSolOutput, slippageBasisPoints);

    return await this.getSellInstructions(seller, mint, globalAccount.feeRecipient, sellTokenAmount, sellAmountWithSlippage);
  }
  // 获取出售指令
  async getSellInstructions(seller, mint, feeRecipient, amount, minSolOutput) {
    const associatedBondingCurve = await getAssociatedTokenAddress(mint, this.getBondingCurvePDA(mint), true);

    const associatedUser = await getAssociatedTokenAddress(mint, seller, false);

    let transaction = new Transaction();

    transaction.add(
      await this.program.methods
        .sell(new BN(amount.toString()), new BN(minSolOutput.toString()))
        .accounts({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: associatedUser,
          user: seller,
        })
        .transaction(),
    );

    return transaction;
  }
  
  async getBondingCurveAccount(mint, commitment = DEFAULT_COMMITMENT) {
    const tokenAccount = await this.connection.getAccountInfo(this.getBondingCurvePDA(mint), commitment);
    if (!tokenAccount) {
      return null;
    }
    return BondingCurveAccount.fromBuffer(tokenAccount.data);
  }
  
  async getGlobalAccount(commitment = DEFAULT_COMMITMENT) {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_ACCOUNT_SEED)], new PublicKey(PROGRAM_ID));

    const tokenAccount = await this.connection.getAccountInfo(globalAccountPDA, commitment);

    return GlobalAccount.fromBuffer(tokenAccount.data);
  }

  getBondingCurvePDA(mint) {
    return PublicKey.findProgramAddressSync([Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()], this.program.programId)[0];
  }

  async createTokenMetadata(create) {
    let formData = new FormData();
    formData.append("file", create.file),
      formData.append("name", create.name),
      formData.append("symbol", create.symbol),
      formData.append("description", create.description),
      formData.append("twitter", create.twitter || ""),
      formData.append("telegram", create.telegram || ""),
      formData.append("website", create.website || ""),
      formData.append("showName", "true");
    const response = await axios.post("https://pump.fun/api/ipfs", formData, {
      headers: formData.getHeaders(),
    });
    return response.data;
  }

  //事件监听
  addEventListener(eventType, callback) {
    return this.program.addEventListener(eventType, (event, slot, signature) => {
      let processedEvent;
      switch (eventType) {
        case "createEvent":
          processedEvent = toCreateEvent(event);
          callback(processedEvent, slot, signature);
          break;
        case "tradeEvent":
          processedEvent = toTradeEvent(event);
          callback(processedEvent, slot, signature);
          break;
        case "completeEvent":
          processedEvent = toCompleteEvent(event);
          callback(processedEvent, slot, signature);
          console.log("completeEvent", event, slot, signature);
          break;
        case "setParamsEvent":
          processedEvent = toSetParamsEvent(event);
          callback(processedEvent, slot, signature);
          break;
        default:
          console.error("Unhandled event type:", eventType);
      }
    });
  }

  removeEventListener(eventId) {
    this.program.removeEventListener(eventId);
  }
}

const DEFAULT_COMMITMENT = "finalized";
const DEFAULT_FINALITY = "finalized";
// 计算购买时的滑点
const calculateWithSlippageBuy = (amount, basisPoints) => {
  return amount + (amount * basisPoints) / 10000n;
};
// 计算出售时的滑点
///////////////// 动态滑点修改: 卖出时影响SOL数量 /////////////////
const calculateWithSlippageSell = (solAmount, basisPoints) => {
  // SOL数量减去滑点
  return solAmount - (solAmount * basisPoints) / 10000n;
};
///////////////////////////////////////////////////////////////////////////
const getComputeUnitsSimulation = async (connection, tx, payer, threshold) => {
  threshold = threshold || 1.05; // 增加0.05的阈值
  const testInstructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...tx.instructions];

  const testTransaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: testInstructions,
      payerKey: payer,
      
      recentBlockhash: PublicKey.default.toString(),
    }).compileToV0Message(),
  );

  const rpcResponse = await connection.simulateTransaction(testTransaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  var unitsConsumed = rpcResponse.value.unitsConsumed;

  return parseInt(unitsConsumed * threshold);
};

async function sendTx(connection, tx, payer, signers, priorityFees, commitment = DEFAULT_COMMITMENT, finality = DEFAULT_FINALITY) {
  let newTx = new Transaction();

  if (priorityFees) {
    var units;
    var microLamports;
    
    if (priorityFees?.autoCalculate == true && priorityFees?.fee) {
      units = await getComputeUnitsSimulation(connection, tx, payer, priorityFees?.threshold || null);
    } else {
      units = priorityFees.unitLimit;
    }
    
    if (priorityFees?.fee && !priorityFees?.unitPrice) {
      microLamports = parseInt(((priorityFees.fee * LAMPORTS_PER_SOL) / units) * 1000000000);
    } else {
      microLamports = priorityFees.unitPrice;
    }

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units });
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
    newTx.add(modifyComputeUnits);
    newTx.add(addPriorityFee);
  }

  newTx.add(tx);

  let versionedTx = await buildVersionedTx(connection, payer, newTx, commitment);
  versionedTx.sign(signers);

  try {
    const sig = await connection.sendTransaction(versionedTx, {
      skipPreflight: false,
    });

    var start = new Date().getTime();
    let txResult = await getTxDetails(connection, sig, commitment, finality);
    var end = new Date().getTime();
    if (!txResult) {
      return {
        success: false,
        error: "交易失败",
        confirmDuration: end - start,
      };
    }
    return {
      success: true,
      signature: sig,
      confirmDuration: end - start,
      
    };
  } catch (e) {
    var logs;
    if (e instanceof SendTransactionError) {
      let ste = e;
      logs = await ste.getLogs(connection);
    }
    return {
      error: e?.message || e,
      logs,
      success: false,
    };
  }
}

const buildVersionedTx = async (connection, payer, tx, commitment = DEFAULT_COMMITMENT) => {
  const blockHash = (await connection.getLatestBlockhash(commitment)).blockhash;

  let messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockHash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
};

const getTxDetails = async (connection, sig, commitment = DEFAULT_COMMITMENT, finality = DEFAULT_FINALITY) => {
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: sig,
    },
    commitment,
  );

  return true;
};

function toCreateEvent(event) {
  return {
    name: event.name,
    symbol: event.symbol,
    uri: event.uri,
    mint: new PublicKey(event.mint),
    bondingCurve: new PublicKey(event.bondingCurve),
    user: new PublicKey(event.user),
  };
}

function toCompleteEvent(event) {
  return {
    user: new PublicKey(event.user),
    mint: new PublicKey(event.mint),
    bondingCurve: new PublicKey(event.bondingCurve),
    timestamp: event.timestamp,
  };
}

function toTradeEvent(event) {
  return {
    mint: new PublicKey(event.mint),
    solAmount: BigInt(event.solAmount),
    tokenAmount: BigInt(event.tokenAmount),
    isBuy: event.isBuy,
    user: new PublicKey(event.user),
    timestamp: Number(event.timestamp),
    virtualSolReserves: BigInt(event.virtualSolReserves),
    virtualTokenReserves: BigInt(event.virtualTokenReserves),
    realSolReserves: BigInt(event.realSolReserves),
    realTokenReserves: BigInt(event.realTokenReserves),
  };
}

function toSetParamsEvent(event) {
  return {
    feeRecipient: new PublicKey(event.feeRecipient),
    initialVirtualTokenReserves: BigInt(event.initialVirtualTokenReserves),
    initialVirtualSolReserves: BigInt(event.initialVirtualSolReserves),
    initialRealTokenReserves: BigInt(event.initialRealTokenReserves),
    tokenTotalSupply: BigInt(event.tokenTotalSupply),
    feeBasisPoints: BigInt(event.feeBasisPoints),
  };
}

class GlobalAccount {
  initialized = false;

  constructor(discriminator, initialized, authority, feeRecipient, initialVirtualTokenReserves, initialVirtualSolReserves, initialRealTokenReserves, tokenTotalSupply, feeBasisPoints) {
    this.discriminator = discriminator;
    this.initialized = initialized;
    this.authority = authority;
    this.feeRecipient = feeRecipient;
    this.initialVirtualTokenReserves = initialVirtualTokenReserves;
    this.initialVirtualSolReserves = initialVirtualSolReserves;
    this.initialRealTokenReserves = initialRealTokenReserves;
    this.tokenTotalSupply = tokenTotalSupply;
    this.feeBasisPoints = feeBasisPoints;
  }

  getInitialBuyPrice(amount) {
    
    if (amount <= 0n) {
      return 0n;
    }
    
    let n = this.initialVirtualSolReserves * this.initialVirtualTokenReserves;
    
    let i = this.initialVirtualSolReserves + amount;
    
    let r = n / i + 1n;
    
    let s = this.initialVirtualTokenReserves - r;
    
    return s < this.initialRealTokenReserves ? s : this.initialRealTokenReserves;
  }


  static fromBuffer(buffer) {
    const structure = struct([u64("discriminator"), bool("initialized"), publicKey("authority"), publicKey("feeRecipient"), u64("initialVirtualTokenReserves"), u64("initialVirtualSolReserves"), u64("initialRealTokenReserves"), u64("tokenTotalSupply"), u64("feeBasisPoints")]);

    let value = structure.decode(buffer);
    return new GlobalAccount(BigInt(value.discriminator), value.initialized, value.authority, value.feeRecipient, BigInt(value.initialVirtualTokenReserves), BigInt(value.initialVirtualSolReserves), BigInt(value.initialRealTokenReserves), BigInt(value.tokenTotalSupply), BigInt(value.feeBasisPoints));
  }
}

class BondingCurveAccount {
  constructor(discriminator, virtualTokenReserves, virtualSolReserves, realTokenReserves, realSolReserves, tokenTotalSupply, complete) {
    this.discriminator = discriminator;
    this.virtualTokenReserves = virtualTokenReserves;
    this.virtualSolReserves = virtualSolReserves;
    this.realTokenReserves = realTokenReserves;
    this.realSolReserves = realSolReserves;
    this.tokenTotalSupply = tokenTotalSupply;
    this.complete = complete;
  }
  // 获取购买价格
  getBuyPrice(amount) {
    if (this.complete) {
      throw new Error("曲线已完成");
    }

    if (amount <= 0n) {
      return 0n;
    }

    // 计算虚拟储备的乘积
    let n = this.virtualSolReserves * this.virtualTokenReserves;

    // 计算购买后的新虚拟Sol储备
    let i = this.virtualSolReserves + amount;

    // 计算购买后的新虚拟Token储备
    let r = n / i + 1n;

    // 计算要购买的Token数量
    let s = this.virtualTokenReserves - r;

    // 返回计算的Token数量和实际Token储备中的最小值
    return s < this.realTokenReserves ? s : this.realTokenReserves;
  }
  // 获取出售价格
  getSellPrice(amount, feeBasisPoints) {
    if (this.complete) {
      throw new Error("曲线已完成");
    }

    if (amount <= 0n) {
      return 0n;
    }

    // 计算要接收的虚拟Sol储备的比例
    let n = (amount * this.virtualSolReserves) / (this.virtualTokenReserves + amount);

    // 计算费用金额
    let a = (n * feeBasisPoints) / 10000n;

    // 返回扣除费用后的净金额
    return n - a;
  }
  
  getMarketCapSOL() {
    if (this.virtualTokenReserves === 0n) {
      return 0n;
    }
    
    return (this.tokenTotalSupply * this.virtualSolReserves) / this.virtualTokenReserves;
  }
  
  getFinalMarketCapSOL(feeBasisPoints) {
    let totalSellValue = this.getBuyOutPrice(this.realTokenReserves, feeBasisPoints);
    let totalVirtualValue = this.virtualSolReserves + totalSellValue;
    let totalVirtualTokens = this.virtualTokenReserves - this.realTokenReserves;

    if (totalVirtualTokens === 0n) {
      return 0n;
    }
    
    return (this.tokenTotalSupply * totalVirtualValue) / totalVirtualTokens;
  }
  
  getBuyOutPrice(amount, feeBasisPoints) {
    let solTokens = amount < this.realSolReserves ? this.realSolReserves : amount;
    let totalSellValue = (solTokens * this.virtualSolReserves) / (this.virtualTokenReserves - solTokens) + 1n;
    let fee = (totalSellValue * feeBasisPoints) / 10000n;
    return totalSellValue + fee;
  }
  
  static fromBuffer(buffer) {
    const structure = struct([u64("discriminator"), u64("virtualTokenReserves"), u64("virtualSolReserves"), u64("realTokenReserves"), u64("realSolReserves"), u64("tokenTotalSupply"), bool("complete")]);

    let value = structure.decode(buffer);
    return new BondingCurveAccount(BigInt(value.discriminator), BigInt(value.virtualTokenReserves), BigInt(value.virtualSolReserves), BigInt(value.realTokenReserves), BigInt(value.realSolReserves), BigInt(value.tokenTotalSupply), value.complete);
  }
}

class AMM {
  constructor(virtualSolReserves, virtualTokenReserves, realSolReserves, realTokenReserves, initialVirtualTokenReserves) {
    this.virtualSolReserves = virtualSolReserves;
    this.virtualTokenReserves = virtualTokenReserves;
    this.realSolReserves = realSolReserves;
    this.realTokenReserves = realTokenReserves;
    this.initialVirtualTokenReserves = initialVirtualTokenReserves;
  }
  
  static fromGlobalAccount(global) {
    return new AMM(global.initialVirtualSolReserves, global.initialVirtualTokenReserves, 0n, global.initialRealTokenReserves, global.initialVirtualTokenReserves);
  }
  
  static fromBondingCurveAccount(bonding_curve, initialVirtualTokenReserves) {
    return new AMM(bonding_curve.virtualSolReserves, bonding_curve.virtualTokenReserves, bonding_curve.realSolReserves, bonding_curve.realTokenReserves, initialVirtualTokenReserves);
  }
  
  getBuyPrice(tokens) {
    const product_of_reserves = this.virtualSolReserves * this.virtualTokenReserves;
    const new_virtual_token_reserves = this.virtualTokenReserves - tokens;
    const new_virtual_sol_reserves = product_of_reserves / new_virtual_token_reserves + 1n;
    const amount_needed = new_virtual_sol_reserves > this.virtualSolReserves ? new_virtual_sol_reserves - this.virtualSolReserves : 0n;
    return amount_needed > 0n ? amount_needed : 0n;
  }
  
  applyBuy(token_amount) {
    const final_token_amount = token_amount > this.realTokenReserves ? this.realTokenReserves : token_amount;
    const sol_amount = this.getBuyPrice(final_token_amount);

    this.virtualTokenReserves = this.virtualTokenReserves - final_token_amount;
    this.realTokenReserves = this.realTokenReserves - final_token_amount;

    this.virtualSolReserves = this.virtualSolReserves + sol_amount;
    this.realSolReserves = this.realSolReserves + sol_amount;

    return {
      token_amount: final_token_amount,
      sol_amount: sol_amount,
    };
  }
  
  applySell(token_amount) {
    this.virtualTokenReserves = this.virtualTokenReserves + token_amount;
    this.realTokenReserves = this.realTokenReserves + token_amount;

    const sell_price = this.getSellPrice(token_amount);

    this.virtualSolReserves = this.virtualSolReserves - sell_price;
    this.realSolReserves = this.realSolReserves - sell_price;

    return {
      token_amount: token_amount,
      sol_amount: sell_price,
    };
  }
  
  getSellPrice(tokens) {
    const scaling_factor = this.initialVirtualTokenReserves;
    const token_sell_proportion = (tokens * scaling_factor) / this.virtualTokenReserves;
    const sol_received = (this.virtualSolReserves * token_sell_proportion) / scaling_factor;
    return sol_received < this.realSolReserves ? sol_received : this.realSolReserves;
  }
}
///////////////// 动态滑点修改: 新增代币滑点计算函数 /////////////////
// 代币滑点计算函数
const calculateTokenSlippage = (tokenAmount, basisPoints) => {
  // 代币数量减去滑点
  return tokenAmount - (tokenAmount * basisPoints) / 10000n;
};
///////////////////////////////////////////////////////////////////////////

module.exports = {
  PumpFunSDK,
  DEFAULT_DECIMALS,
};

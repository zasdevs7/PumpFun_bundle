# PumpFun_bundle

基于 Solana 区块链的Pumpfun自动化代币交易机器人，支持代币创建、捆绑买卖和地址表优化的方法。

## 功能特点

- 🪙 代币创建：支持自定义代币名称、符号和图片
- 💰 捆绑交易：支持21个钱包捆绑买卖操作
- 📊 地址优化：集成地址查找表(ALT)降低交易费用
- ⚡ MEV保护：集成 Jito MEV-Boost 提高交易成功率
- 🔄 自动化：全自动化的交易流程
- 🛡️ 滑点保护：内置滑点保护机制

## 项目结构

```
PumpFun_bundle/
├── src/                    # 源代码目录
│   ├── sdk/               # SDK核心实现
│   │   └── pumpFunSDK.js  # Pump Fun协议的SDK实现
│   ├── utils/             # 工具函数
│   │   └── addressLookupTable.js  # 地址查找表工具
│   ├── scripts/           # 执行脚本
│   │   ├── tokenCreateAndBuy.js   # 创建和购买代币
│   │   ├── tokenSell.js           # 出售代币
│   │   └── addressTableManager.js  # 地址表管理
│   └── IDL/               # 接口定义
│       ├── pumpFunProtocol.json   # 协议接口定义
│       └── protocolExport.js      # 导出接口
└── config/                # 配置文件目录
    ├── img/              # 代币图片目录
    ├── walletKeys.txt    # 钱包私钥文件
    └── lookupTable.txt   # 地址查找表配置
```

## 安装说明

1. 克隆项目
```
git clone https://github.com/your-repo/PumpFun_bundle.git
```

2. 安装依赖
```
npm install
```

3. 配置钱包私钥和地址查找表
```
创建配置目录
mkdir -p config/img
添加私钥文件
touch config/walletKeys.txt
添加代币图片
cp your_token_image.png config/img/
```

## 使用说明
 
 1.创建和购买代币
```
node src/scripts/tokenCreateAndBuy.js
```

2.出售代币
```
node src/scripts/tokenSell.js
```

3.地址表管理
```
node src/scripts/addressTableManager.js
```

## 配置说明

1. 钱包私钥：config/walletKeys.txt
```
[钱包1私钥]
…………………………
[钱包20私钥]
```

2. 代币图片
- 将代币图片放入 `config/img/` 目录
- 支持 jpg、jpeg、png、gif 格式

3. RPC配置
- 在脚本中设置 RPC 节点地址
- 建议使用私有 RPC 节点以提高性能

## 注意事项

- ⚠️ 请妥善保管私钥文件
- 🔒 建议使用独立的交易钱包
- 💡 建议使用私有 RPC 节点
- 📊 关注滑点设置以控制风险

## 免责声明

本项目仅供学习研究使用，使用本项目进行的任何操作造成的损失均与作者无关。在使用本项目前，请确保您已经充分了解相关风险。


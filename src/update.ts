/* eslint-disable @typescript-eslint/camelcase */
import { PolyjuiceWallet, PolyjuiceJsonRpcProvider } from '@polyjuice-provider/ethers';
import { BigNumber, providers } from 'ethers';
import fetch from 'node-fetch';

import { FeedRegistry__factory, MockV3Aggregator__factory } from '../typechain';
import {
    COINAPI_KEY,
    ETH_MAINNET_RPC,
    EXISTING_FEED_REGISTRY_CONTRACT_ADDRESS,
    NERVOS_PROVIDER_URL,
    USER_ONE_PRIVATE_KEY
} from './config';

const nervosProviderConfig = {
    web3Url: NERVOS_PROVIDER_URL
};

enum DENOMINATIONS {
    CKB = '0x0000000000000000000000000000000000000001',
    ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USD = '0x0000000000000000000000000000000000000348',
    DAI = '0x7Af456bf0065aADAB2E6BEc6DaD3731899550b84'
}

enum ETH_MAINNET_DENOMINATIONS {
    DAI = '0x6b175474e89094c44da98b954eedeac495271d0f'
}

const ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS = '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf';

const rpc = new PolyjuiceJsonRpcProvider(nervosProviderConfig, nervosProviderConfig.web3Url);
const deployer = new PolyjuiceWallet(USER_ONE_PRIVATE_KEY, nervosProviderConfig, rpc);

const ethMainnetProvider = new providers.WebSocketProvider(ETH_MAINNET_RPC);

const aggregators = [
    {
        description: 'ETH / USD',
        address: '0xC0d16A34629597717dc038642739aBE3d2cD210A',
        base: DENOMINATIONS.ETH,
        quote: DENOMINATIONS.USD,
        getLatestData: async () => {
            const registry = FeedRegistry__factory.connect(
                ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS,
                ethMainnetProvider
            );

            const data = await registry.latestRoundData(DENOMINATIONS.ETH, DENOMINATIONS.USD);

            return data.answer;
        }
    },
    {
        description: 'DAI / ETH',
        address: '0x5D3f43de8Ae0b703c68A2d9A88efDA1ce37eD229',
        base: DENOMINATIONS.DAI,
        quote: DENOMINATIONS.ETH,
        getLatestData: async () => {
            const registry = FeedRegistry__factory.connect(
                ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS,
                ethMainnetProvider
            );

            const data = await registry.latestRoundData(
                ETH_MAINNET_DENOMINATIONS.DAI,
                DENOMINATIONS.ETH
            );

            return data.answer;
        }
    },
    {
        description: 'CKB / USD',
        address: '0x0B3187A38d37704A7c775825A247E666D686a8A7',
        base: DENOMINATIONS.CKB,
        quote: DENOMINATIONS.USD,
        getLatestData: async () => {
            const response = await fetch('https://rest.coinapi.io/v1/exchangerate/CKB/USD', {
                headers: {
                    'X-CoinAPI-Key': COINAPI_KEY
                }
            });

            const { rate } = (await response.json()) as { rate: number };

            const formattedRate = Math.ceil(rate * 10 ** 8);

            return formattedRate.toString();
        }
    }
];

// function getDenominationsContract() {
//     return Denominations__factory.connect(EXISTING_DENOMINATIONS_CONTRACT_ADDRESS, deployer);
// }

function getFeedRegistryContract() {
    return FeedRegistry__factory.connect(EXISTING_FEED_REGISTRY_CONTRACT_ADDRESS, deployer);
}

async function runDemo() {
    // const denominations = await getDenominationsContract();

    // console.log(await denominations.methods.CKB().call());

    const feedRegistry = await getFeedRegistryContract();

    // const typeAndVersion = await feedRegistry.methods.typeAndVersion().call();

    // console.log({
    //     typeAndVersion
    // });

    async function updateAllFeeds() {
        for (const aggregator of aggregators) {
            const latestData = await aggregator.getLatestData();

            if (latestData === null || typeof latestData === 'undefined') {
                console.log(
                    `Can't get aggregator "${aggregator.description}" latest data. Skipping...`
                );
                continue;
            }

            const aggregatorContract = MockV3Aggregator__factory.connect(
                aggregator.address,
                deployer
            );

            const { answer } = await feedRegistry.latestRoundData(
                aggregator.base,
                aggregator.quote
            );

            if (BigNumber.from(latestData).eq(answer)) {
                console.log(`Price of "${aggregator.description}" already updated.`);
            } else {
                console.log(`Updating ${aggregator.description} price...`);

                await (await aggregatorContract.updateAnswer(latestData)).wait();

                console.log(`Price of ${aggregator.description} updated to: "${latestData}"`);
            }
        }
    }

    await updateAllFeeds();

    // const latestRoundData = await feedRegistry.methods
    //     .latestRoundData(DENOMINATIONS.CKB, DENOMINATIONS.USD)
    //     .call();

    // console.log({
    //     latestRoundData
    // });

    process.exit(0);
}

(async () => {
    await runDemo();
})();

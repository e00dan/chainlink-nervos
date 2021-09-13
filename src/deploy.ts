/* eslint-disable @typescript-eslint/camelcase */
import { PolyjuiceWallet, PolyjuiceJsonRpcProvider } from '@polyjuice-provider/ethers';
import { BigNumber, providers } from 'ethers';
import fetch from 'node-fetch';

import {
    Denominations__factory,
    FeedRegistry__factory,
    MockV3Aggregator,
    MockV3Aggregator__factory
} from '../typechain';
import { COINAPI_KEY, ETH_MAINNET_RPC, USER_ONE_PRIVATE_KEY } from './config';

const nervosProviderConfig = {
    web3Url: 'http://localhost:8024'
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
        base: DENOMINATIONS.ETH,
        quote: DENOMINATIONS.USD,
        decimals: 8,
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
        decimals: 18,
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
        decimals: 8,
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

async function deployDenominationsContract() {
    console.log('Deploying Denominations...');

    const factory = new Denominations__factory(deployer);
    const tx = factory.getDeployTransaction();
    const receipt = await (await deployer.sendTransaction(tx)).wait();
    const denominations = Denominations__factory.connect(receipt.contractAddress, deployer);

    console.log(`Denominations deployed at: ${denominations.address}`);

    return denominations;
}

async function deployFeedRegistryContract() {
    const implementationFactory = new FeedRegistry__factory(deployer);
    const tx = implementationFactory.getDeployTransaction();
    const receipt = await (await deployer.sendTransaction(tx)).wait();
    const contract = FeedRegistry__factory.connect(receipt.contractAddress, deployer);

    console.log(`Feed registry deployed at: ${contract.address}`);

    return contract;
}

async function addAggregator(
    description: string,
    base: DENOMINATIONS,
    quote: DENOMINATIONS,
    decimals: number,
    initialPrice: string | BigNumber
) {
    console.log(`Adding "${description}" aggregator.`, {
        description,
        base,
        quote,
        decimals,
        initialPrice
    });

    const implementationFactory = new MockV3Aggregator__factory(deployer);

    const tx = implementationFactory.getDeployTransaction(decimals, initialPrice, description);
    const receipt = await (await deployer.sendTransaction(tx)).wait();
    const contract = MockV3Aggregator__factory.connect(receipt.contractAddress, deployer);

    console.log(`Aggregator ${description} deployed at: ${contract.address}`);

    return contract;
}

async function runDemo() {
    const denominations = await deployDenominationsContract();

    console.log(`Example CKB denomination from contract: ${await denominations.CKB()}`);

    const feedRegistry = await deployFeedRegistryContract();

    const typeAndVersion = await feedRegistry.typeAndVersion();

    console.log({
        typeAndVersion
    });

    async function addAllFeeds() {
        const addedAggregators: MockV3Aggregator[] = [];

        for (const aggregator of aggregators) {
            const latestData = await aggregator.getLatestData();

            if (latestData === null || typeof latestData === 'undefined') {
                console.log(
                    `Can't get aggregator "${aggregator.description}" latest data. Skipping...`
                );
                continue;
            }

            const aggregatorContract = await addAggregator(
                aggregator.description,
                aggregator.base,
                aggregator.quote,
                aggregator.decimals,
                latestData
            );

            addedAggregators.push(aggregatorContract);
        }

        return addedAggregators;
    }

    const addedAggregators = await addAllFeeds();

    let i = 0;
    for (const aggregator of aggregators) {
        console.log(`Proposing feed... ${aggregator.description}`);

        const aggregatorAddress = addedAggregators[i].address;

        await (
            await feedRegistry.proposeFeed(aggregator.base, aggregator.quote, aggregatorAddress)
        ).wait();

        console.log('Confirming feed...');

        await (
            await feedRegistry.confirmFeed(aggregator.base, aggregator.quote, aggregatorAddress)
        ).wait();

        console.log('Feed added to the registry.');
        i++;
    }

    async function getAllPrices() {
        for (const aggregator of aggregators) {
            const latestRoundData = await feedRegistry.latestRoundData(
                aggregator.base,
                aggregator.quote
            );

            console.log({
                description: aggregator.description,
                latestRoundData
            });
        }
    }

    await getAllPrices();

    process.exit(0);
}

(async () => {
    await runDemo();
})();

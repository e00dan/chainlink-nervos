/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-use-before-define */
import Web3 from 'web3';
import { PolyjuiceAccounts, PolyjuiceHttpProvider } from '@polyjuice-provider/web3';
import fetch from 'node-fetch';

import { FeedRegistry } from './types/FeedRegistry';
import { MockV3Aggregator } from './types/MockV3Aggregator';
import { Denominations } from './types/Denominations';

import * as FeedRegistryJSON from '../build/contracts/FeedRegistry.json';
import * as MockV3AggregatorJSON from '../build/contracts/MockV3Aggregator.json';
import * as DenominationsJSON from '../build/contracts/Denominations.json';

const USER_ONE_PRIVATE_KEY = 'YOUR_PRIVATE_KEY';
const ETH_MAINNET_RPC = 'YOUR_ETH_MAINNET_RPC_EG_INFURA';
const COINAPI_KEY = 'YOUR_COINAPI_KEY'; // https://www.coinapi.io/

const nervosProviderConfig = {
    web3Url: 'https://godwoken-testnet-web3-rpc.ckbapp.dev'
};

const EXISTING_DENOMINATIONS_CONTRACT_ADDRESS = '0x7AAA3D9160d9095958B7bbdeA94737cbA7f8693B';
const EXISTING_FEED_REGISTRY_CONTRACT_ADDRESS = '0x1363bdCE312532F864e84924D54c7dA5eDB5B1BC';

enum DENOMINATIONS {
    CKB = '0x0000000000000000000000000000000000000001',
    ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USD = '0x0000000000000000000000000000000000000348',
    DAI = '0x7Af456bf0065aADAB2E6BEc6DaD3731899550b84'
}

enum ETH_MAINNET_DENOMINATIONS {
    DAI = '0x6b175474e89094c44da98b954eedeac495271d0f'
}

const web3Eth = new Web3(ETH_MAINNET_RPC);
const ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS = '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf';

const aggregators = [
    {
        description: 'ETH / USD',
        address: '0xC0d16A34629597717dc038642739aBE3d2cD210A',
        base: DENOMINATIONS.ETH,
        quote: DENOMINATIONS.USD,
        getLatestData: async () => {
            const registry = (new web3Eth.eth.Contract(
                FeedRegistryJSON.abi as any,
                ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS
            ) as any) as FeedRegistry;

            const data = await registry.methods
                .latestRoundData(DENOMINATIONS.ETH, DENOMINATIONS.USD)
                .call();

            return data.answer;
        }
    },
    {
        description: 'DAI / ETH',
        address: '0x5D3f43de8Ae0b703c68A2d9A88efDA1ce37eD229',
        base: DENOMINATIONS.DAI,
        quote: DENOMINATIONS.ETH,
        getLatestData: async () => {
            const registry = (new web3Eth.eth.Contract(
                FeedRegistryJSON.abi as any,
                ETHEREUM_MAINNET_FEED_REGISTRY_ADDRESS
            ) as any) as FeedRegistry;

            const data = await registry.methods
                .latestRoundData(ETH_MAINNET_DENOMINATIONS.DAI, DENOMINATIONS.ETH)
                .call();

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

const nervosProvider = new PolyjuiceHttpProvider(
    nervosProviderConfig.web3Url,
    nervosProviderConfig
);

const web3 = new Web3(nervosProvider);

web3.eth.accounts = new PolyjuiceAccounts(nervosProviderConfig);
const USER_ONE_ACCOUNT = web3.eth.accounts.wallet.add(USER_ONE_PRIVATE_KEY);
(web3.eth.Contract as any).setProvider(nervosProvider, web3.eth.accounts);

const userOneEthAddress = USER_ONE_ACCOUNT.address;

const DEFAULT_SEND_OPTIONS = {
    from: userOneEthAddress,
    gas: 6000000,
    gasPrice: '0'
};

async function getDenominationsContract(existing = true) {
    if (existing) {
        return (new web3.eth.Contract(
            DenominationsJSON.abi as any,
            EXISTING_DENOMINATIONS_CONTRACT_ADDRESS
        ) as any) as Denominations;
    }

    console.log('Deploying Denominations...');

    const DenominationsContract: Denominations = new web3.eth.Contract(
        DenominationsJSON.abi as any
    ) as any;

    const denominations = (await (DenominationsContract.deploy({
        data: DenominationsJSON.bytecode,
        arguments: []
    }).send(DEFAULT_SEND_OPTIONS) as any)) as Denominations;

    console.log(`Denominations deployed at: ${denominations.options.address}`);

    return denominations;
}

async function getFeedRegistryContract(existing = true) {
    if (existing) {
        return (new web3.eth.Contract(
            FeedRegistryJSON.abi as any,
            EXISTING_FEED_REGISTRY_CONTRACT_ADDRESS
        ) as any) as FeedRegistry;
    }

    const FeedRegistryContract: FeedRegistry = new web3.eth.Contract(
        FeedRegistryJSON.abi as any
    ) as any;

    const feedRegistryDeployTx = FeedRegistryContract.deploy({
        data: FeedRegistryJSON.bytecode,
        arguments: []
    }).send(DEFAULT_SEND_OPTIONS);

    feedRegistryDeployTx.on('transactionHash', (hash: string) =>
        console.log(`Feed Registry deploy transaction hash: ${hash}`)
    );

    const feedRegistry = ((await feedRegistryDeployTx) as any) as FeedRegistry;

    console.log(`Feed registry deployed at: ${feedRegistry.options.address}`);

    return feedRegistry;
}

async function getAggregatorContract(
    description: string,
    base: DENOMINATIONS,
    quote: DENOMINATIONS,
    decimals: number,
    initialPrice: number
) {
    const MockAggregatorContract: MockV3Aggregator = new web3.eth.Contract(
        MockV3AggregatorJSON.abi as any
    ) as any;

    const aggregatorDeployTx = MockAggregatorContract.deploy({
        data: MockV3AggregatorJSON.bytecode,
        arguments: [decimals, initialPrice, description]
    }).send(DEFAULT_SEND_OPTIONS);

    aggregatorDeployTx.on('transactionHash', (hash: string) =>
        console.log(`Aggregator "${description}" deploy transaction hash: ${hash}`)
    );

    const aggregator: MockV3Aggregator = (await aggregatorDeployTx) as any;

    console.log(`Aggregator ${description} deployed at: ${aggregator.options.address}`);

    return aggregator;
}

async function addAggregator(
    description: string,
    base: DENOMINATIONS,
    quote: DENOMINATIONS,
    decimals: number,
    initialPrice: number,
    feedRegistry: FeedRegistry
) {
    console.log(`Adding "${description}" aggregator.`);

    const MockAggregatorContract: MockV3Aggregator = new web3.eth.Contract(
        MockV3AggregatorJSON.abi as any
    ) as any;

    const aggregatorDeployTx = MockAggregatorContract.deploy({
        data: MockV3AggregatorJSON.bytecode,
        arguments: [decimals, initialPrice, description]
    }).send(DEFAULT_SEND_OPTIONS);

    aggregatorDeployTx.on('transactionHash', (hash: string) =>
        console.log(`Aggregator "${description}" deploy transaction hash: ${hash}`)
    );

    const aggregator: MockV3Aggregator = (await aggregatorDeployTx) as any;

    console.log(`Aggregator ${description} deployed at: ${aggregator.options.address}`);

    console.log('Checking if feed already proposed...');

    const alreadyProposedFeed = await feedRegistry.methods
        .getProposedFeed(DENOMINATIONS.ETH, DENOMINATIONS.USD)
        .call();

    console.log({
        alreadyProposedFeed
    });

    if (alreadyProposedFeed === aggregator.options.address) {
        console.log('Feed was already proposed.');
    } else {
        console.log('Proposing feed...');

        await feedRegistry.methods
            .proposeFeed(base, quote, aggregator.options.address)
            .send(DEFAULT_SEND_OPTIONS);
    }

    console.log('Confirming feed...');

    await feedRegistry.methods
        .confirmFeed(base, quote, aggregator.options.address)
        .send(DEFAULT_SEND_OPTIONS);

    console.log('Feed added to the registry.');

    return aggregator;
}

async function runDemo() {
    console.log({
        userOneEthAddress
    });

    const denominations = await getDenominationsContract();

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

            const mockAggregatorContract: MockV3Aggregator = new web3.eth.Contract(
                MockV3AggregatorJSON.abi as any,
                aggregator.address
            ) as any;

            const { answer } = await feedRegistry.methods
                .latestRoundData(aggregator.base, aggregator.quote)
                .call();

            if (latestData === answer) {
                console.log(`Price of "${aggregator.description}" already updated.`);
            } else {
                console.log(`Updating ${aggregator.description} price...`);

                await mockAggregatorContract.methods
                    .updateAnswer(latestData)
                    .send(DEFAULT_SEND_OPTIONS);

                console.log(`Price of ${aggregator.description} updated to: "${latestData}"`);
            }
        }
    }

    await updateAllFeeds();

    // await updateETHUSDPrice();

    // await addAggregator(
    //     'DAI / ETH',
    //     DENOMINATIONS.DAI,
    //     DENOMINATIONS.ETH,
    //     18,
    //     299798834981727,
    //     feedRegistry
    // );

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

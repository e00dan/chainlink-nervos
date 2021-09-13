import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';

export default {
    solidity: '0.7.6',
    typechain: {
        target: 'ethers-v5'
    }
};

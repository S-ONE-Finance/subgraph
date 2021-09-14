import {
  ADDRESS_ZERO,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_1E6,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_ZERO,
  BIG_INT_ONE,
  BIG_INT_ZERO,
  DAI_WETH_PAIR,
  FACTORY_ADDRESS,
  SONESWAP_WETH_USDT_PAIR_ADDRESS,
  SONE_FACTORY_START_BLOCK,
  SONE_TOKEN_ADDRESS,
  SONE_USDT_PAIR_ADDRESS,
  SONE_USDT_PAIR_START_BLOCK,
  UNISWAP_FACTORY_ADDRESS,
  UNISWAP_SONE_ETH_PAIR_FIRST_LIQUDITY_BLOCK,
  UNISWAP_SONE_USDT_PAIR_ADDRESS,
  UNISWAP_WETH_USDT_PAIR_ADDRESS,
  USDC_WETH_PAIR,
  USDT_ADDRESS,
  USDT_WETH_PAIR,
  WETH_ADDRESS,
} from 'const'
import { Address, BigDecimal, BigInt, ethereum, log } from '@graphprotocol/graph-ts'

import { Factory as FactoryContract } from 'exchange/generated/templates/Pair/Factory'
import { Pair as PairContract } from 'exchange/generated/templates/Pair/Pair'

export function getUSDRate(token: Address, block: ethereum.Block): BigDecimal {
  if (token != USDT_ADDRESS) {
    const tokenPriceETH = getEthRate(token, block)
    const ethPriceUSD = getEthPriceInUSD()
    return ethPriceUSD.times(tokenPriceETH)
  }

  return BIG_DECIMAL_ONE
}

export function getEthRate(token: Address, block: ethereum.Block): BigDecimal {
  let eth = BIG_DECIMAL_ONE

  if (token != WETH_ADDRESS) {
    const factory = FactoryContract.bind(
      block.number.le(SONE_FACTORY_START_BLOCK) ? UNISWAP_FACTORY_ADDRESS : FACTORY_ADDRESS
    )

    const address = factory.getPair(token, WETH_ADDRESS)

    if (address == ADDRESS_ZERO) {
      log.info('Adress ZERO...', [])
      return BIG_DECIMAL_ZERO
    }

    const pair = PairContract.bind(address)

    const reserves = pair.getReserves()

    eth =
      pair.token0() == WETH_ADDRESS
        ? reserves.value0.toBigDecimal().div(reserves.value1.toBigDecimal())
        : reserves.value1.toBigDecimal().div(reserves.value0.toBigDecimal())
  }

  return eth
}

export function getSonePrice(block: ethereum.Block): BigDecimal {
  if (block.number.lt(UNISWAP_SONE_ETH_PAIR_FIRST_LIQUDITY_BLOCK)) {
    // If before uniswap sone-eth pair creation and liquidity added, return zero
    return BIG_DECIMAL_ZERO
  }
  return getUSDRate(SONE_TOKEN_ADDRESS, block)
}


export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  const daiPair = PairContract.bind(Address.fromString(DAI_WETH_PAIR))
  const usdcPair = PairContract.bind(Address.fromString(USDC_WETH_PAIR))
  const usdtPair = PairContract.bind(Address.fromString(USDT_WETH_PAIR))

  const reserveDAIETH: BigDecimal[] = getReservePairETH(daiPair, BigInt.fromI32(18))
  const daiInDaiPair = reserveDAIETH[0]
  const wethInDaiPair = reserveDAIETH[1]

  const reserveUSDCETH: BigDecimal[] = getReservePairETH(usdcPair, BigInt.fromI32(6))
  const usdcInUSDCPair = reserveUSDCETH[0]
  const wethInUSDCPair = reserveUSDCETH[1]

  const reserveUSDTETH: BigDecimal[] = getReservePairETH(usdtPair, BigInt.fromI32(6))
  const usdtInUSDTPair = reserveUSDTETH[0]
  const wethInUSDTPair = reserveUSDTETH[1]

  // all 3 have been created
  if (daiPair !== null && usdcPair !== null && usdtPair !== null) {
    const totalLiquidityETH = wethInDaiPair.plus(wethInUSDCPair).plus(wethInUSDTPair)
    const daiWeight = daiInDaiPair.div(totalLiquidityETH)
    const usdcWeight = usdcInUSDCPair.div(totalLiquidityETH)
    const usdtWeight = usdtInUSDTPair.div(totalLiquidityETH)
    return daiInDaiPair
      .div(wethInDaiPair)
      .times(daiWeight)
      .plus(usdcInUSDCPair.div(wethInUSDCPair).times(usdcWeight))
      .plus(usdtInUSDTPair.div(wethInUSDTPair).times(usdtWeight))
    // dai and USDC have been created
  } else if (daiPair !== null && usdtPair !== null) {
    const totalLiquidityETH = wethInDaiPair.plus(wethInUSDTPair)
    const daiWeight = daiInDaiPair.div(totalLiquidityETH)
    const usdtWeight = usdtInUSDTPair.div(totalLiquidityETH)
    return daiInDaiPair.div(wethInDaiPair).times(daiWeight).plus(usdtInUSDTPair.div(wethInUSDTPair).times(usdtWeight))
    // USDC is the only pair so far
  } else if (usdtPair !== null) {
    return usdtInUSDTPair.div(wethInUSDTPair)
  } else {
    return BIG_DECIMAL_ZERO
  }
}

function getReservePairETH(pair: PairContract, decimalToken: BigInt): BigDecimal[] {
  let reserveToken: BigDecimal
  let reserveWETH: BigDecimal
  const reserves = pair.getReserves()
  if (WETH_ADDRESS == pair.token1()) {
    reserveToken = reserves.value0.toBigDecimal().div(exponentToBigDecimal(decimalToken))
    reserveWETH = reserves.value1.toBigDecimal().div(BIG_DECIMAL_1E18)
  } else {
    reserveToken = reserves.value1.toBigDecimal().div(exponentToBigDecimal(decimalToken))
    reserveWETH = reserves.value0.toBigDecimal().div(BIG_DECIMAL_1E18)
  }
  return [reserveToken, reserveWETH]
}

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = BIG_INT_ZERO; i.lt(decimals as BigInt); i = i.plus(BIG_INT_ONE)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}
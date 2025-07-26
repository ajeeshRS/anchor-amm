use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub seed: u64,                 // unique to make more AMM pools
    pub authority: Option<Pubkey>, // making it optional in case we need to unlock the pool- authority will set to NULL
    pub mint_x: Pubkey,            // one of two TOKEN (eg: SOL/USDC)
    pub mint_y: Pubkey,
    pub fee: u16,        // trading fee on swaps
    pub locked: bool,    // if the pool is locked or not
    pub config_bump: u8, // store the bump to create the PDA for config account
    pub lp_bump: u8,     // store the bump to create the PDA for lp account
}

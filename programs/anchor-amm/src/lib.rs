pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FgXKw2uG31zSn1qvMwLaRAm9BPWHLDBS1wzUzuBM5JhE");

#[program]
pub mod anchor_amm {


    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        seed: u64,
        fee: u16,
        authority: Option<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.initialize(seed, fee, authority, ctx.bumps)?;
        Ok(())
    }
    pub fn deposit(
        ctx: Context<Deposit>,
    ) -> Result<()> {
        Ok(())
    }


}

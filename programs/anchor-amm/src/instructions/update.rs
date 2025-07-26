use anchor_lang::prelude::*;

use crate::{error::AmmError, state::Config};

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config", &config.seed.to_le_bytes().as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,
}

impl<'info> Update<'info> {
    pub fn lock(&mut self) -> Result<()> {
        require!(!self.config.locked, AmmError::PoolLocked);
        require!(
            self.config.authority == Some(self.user.key()),
            AmmError::UnAuthorized
        );

        self.config.locked = true;
        Ok(())
    }

    pub fn unlock(&mut self) -> Result<()> {
        require!(self.config.locked, AmmError::PoolUnLocked);
        require!(
            self.config.authority == Some(self.user.key()),
            AmmError::UnAuthorized
        );

        self.config.locked = false;
        Ok(())
    }
}

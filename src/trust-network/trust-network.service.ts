import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { IndexDocumentType } from '../index/model/index.model';
import { StorageService } from '../storage/storage.service';
import { Role, RoleData } from './interfaces/trust-network.interface';
import { ConfigService } from '../config/config.service';
import { NodeService } from '../node/node.service';
import { Transaction } from 'transaction/interfaces/transaction.interface';

@Injectable()
export class TrustNetworkService {
  private transactionTypes: number[];

  constructor(
    private readonly logger: LoggerService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly node: NodeService,
  ) {
    this.transactionTypes = [16, 17];
  }

  async index(index: IndexDocumentType): Promise<void> {
    const { transaction } = index;

    if (this.transactionTypes.indexOf(transaction.type) === -1) {
      this.logger.debug(`trust-network: unknown transaction type`);
      return;
    }

    if (!transaction.party) {
      this.logger.debug(`trust-network: transaction ${transaction.id} didn't have a party address, skipped indexing`);
      return;
    }

    if (!transaction.associationType) {
      this.logger.debug(
        `trust-network: transaction ${transaction.id} didn't have an association type, skipped indexing`,
      );
      return;
    }

    if (transaction.type === 16) {
      this.logger.debug(`trust-network: saving role association`);
      return this.saveRoleAssociation(transaction);
    } else if (transaction.type === 17) {
      this.logger.debug(`trust-network: removing role association`);
      return this.removeRoleAssociation(transaction);
    }
  }

  async getRolesFor(address: string): Promise<RoleData> {
    const result: RoleData = {
      roles: [],
      issues_roles: [],
      issues_authorization: [],
    };

    let roles;
    const configRoles = this.config.getRoles();

    const root = await this.node.getNodeWallet();

    if (root === address) {
      roles = { root: {} };
    }

    const storageRoles = await this.storage.getRolesFor(address);

    roles = {
      ...roles,
      ...storageRoles,
    };

    for (const role in roles) {
      const configData = configRoles[role];

      if (configData) {
        result.roles.push(role);

        configData.issues?.forEach(eachIssues => {
          if (result.issues_roles.findIndex(each => each.role === eachIssues.role) === -1) {
            result.issues_roles.push(eachIssues);
          }
        });

        configData.authorization?.forEach(eachAuthorization => {
          if (result.issues_authorization.findIndex(each => each === eachAuthorization) === -1) {
            result.issues_authorization.push(eachAuthorization);
          }
        });
      }
    }

    return result;
  }

  private async saveRoleAssociation(transaction: Transaction): Promise<void> {
    try {
      const savedRoles: Role[] = [];
      const senderRoleData = await this.getRolesFor(transaction.sender);

      senderRoleData.issues_roles.forEach(async eachRole => {
        if (eachRole.type === transaction.associationType && !savedRoles.includes(eachRole)) {
          savedRoles.push(eachRole);
          await this.storage.saveRoleAssociation(transaction.party, transaction.sender, eachRole);
        }
      });

      if (savedRoles.length === 0) {
        return;
      }

      const isGettingSponsored = await this.hasSponsoredRoles(savedRoles.map(each => each.role));

      if (isGettingSponsored) {
        if (await this.isSponsoredByNode(transaction.party)) {
          return;
        }

        this.logger.debug(`trust-network: party is being given a sponsored role, sending a transaction to the node`);
        await this.node.sponsor(transaction.party);
      }
    } catch (error) {
      this.logger.error(`trust-network: error saving a role association: "${error}"`);
    }
  }

  private async removeRoleAssociation(transaction: Transaction): Promise<void> {
    const removedRoles: Role[] = [];
    const senderRoleData = await this.getRolesFor(transaction.sender);

    senderRoleData.issues_roles.forEach(async eachRole => {
      if (eachRole.type === transaction.associationType && !removedRoles.includes(eachRole)) {
        removedRoles.push(eachRole);
        await this.storage.removeRoleAssociation(transaction.party, eachRole);
      }
    });

    if (removedRoles.length === 0) {
      return;
    }

    const partyRoleData = await this.getRolesFor(transaction.party);
    const hasSponsoredRolesLeft = this.hasSponsoredRoles(partyRoleData.roles);

    if (!hasSponsoredRolesLeft) {
      this.logger.debug(`trust-network: party has no more sponsored roles, sending a transaction to the node`);
      await this.node.cancelSponsor(transaction.party);
    }
  }

  private async isSponsoredByNode(address: string): Promise<boolean> {
    const nodeAddress = await this.node.getNodeWallet();
    const sponsors = await this.node.getSponsorsOf(address);

    return sponsors.includes(nodeAddress);
  }

  private hasSponsoredRoles(roles: string[]): boolean {
    return roles.reduce((previous, current, index) => {
      const each = roles[index];
      const configRoles = this.config.getRoles();

      return !!configRoles[each]?.sponsored;
    }, false);
  }
}

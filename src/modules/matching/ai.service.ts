import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  suggestNoMatch(listing: {
    desiredState: string;
    desiredCity: string;
    desiredArea?: string | null;
    desiredType: string;
    maxBudget: number;
    timeline: string;
  }) {
    const tips: string[] = [];

    if (listing.maxBudget < 500000) {
      tips.push('Increase your budget range by 10–20% to unlock more matches.');
    }

    const preferredLocation = [
      listing.desiredArea,
      listing.desiredCity,
      listing.desiredState,
    ]
      .filter(Boolean)
      .join(', ');

    tips.push(
      `Try adding nearby areas or cities related to "${preferredLocation}" to widen your search.`,
    );

    tips.push(
      `If possible, make your timeline more flexible than "${listing.timeline}" to match more availability windows.`,
    );

    return tips;
  }
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  suggestNoMatch(listing: {
    desiredCity: string;
    desiredType: string;
    maxBudget: number;
    timeline: string;
  }) {
    // MVP: lightweight rule-based “AI”
    // Later: replace with Gemini 3 Flash call.
    const tips: string[] = [];

    if (listing.maxBudget < 500000) {
      tips.push('Increase your budget range by 10–20% to unlock more matches.');
    }

    tips.push(
      `Try adding nearby areas/cities related to "${listing.desiredCity}" (e.g., mainland/island split).`,
    );

    tips.push(
      `If possible, make your timeline more flexible than "${listing.timeline}" to match more availability windows.`,
    );

    return tips;
  }
}
